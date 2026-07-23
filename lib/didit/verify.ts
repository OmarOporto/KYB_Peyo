import "server-only";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import type { AmlStatus } from "@/lib/kyb/types";
import type { DiditFeature, Field, FormDefinition, Section } from "@/lib/forms/definition";
import {
  KYB_REG_NUMBER_RE,
  KYB_REG_NUMBER_EXCLUDE_RE,
  KYB_COUNTRY_RES,
} from "@/lib/forms/definition";
import { alpha3ToAlpha2 } from "@/lib/forms/countries";

// Bucket privado donde viven los archivos/selfies (igual que lib/kyb/service.ts).
const DOCUMENTS_BUCKET = "kyb-documents";

export interface DiditCheckRow {
  feature: DiditFeature;
  fieldKey: string | null;
  externalRef: string | null;
  status: AmlStatus; // mapeado al enum de aml_checks
  score: number | null;
  result: Record<string, unknown>;
}

// ------------------------------------------------------------
// HTTP hacia DIDIT (host verification.didit.me, auth x-api-key)
// ------------------------------------------------------------
function base(): string {
  return (env.diditApiUrl() || "https://verification.didit.me").replace(/\/+$/, "");
}
function apiKey(): string {
  const k = env.diditApiKey();
  if (!k) throw new Error("DIDIT_API_KEY no configurado");
  return k;
}

// Log conciso por llamada. NO se vuelca el body (trae PII: nombre, documento,
// fecha de nacimiento, URLs firmadas); el detalle completo queda en aml_checks.result.
function logDiditCall(path: string, status: number, json: unknown): void {
  const node = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  console.log(`[DIDIT] POST ${path} -> ${status} request_id=${node.request_id ?? "-"}`);
}

// Corta una llamada DIDIT colgada para que no estire el trabajo en background.
const DIDIT_TIMEOUT_MS = 30_000;

async function postJson(
  path: string,
  body: unknown,
  timeoutMs = DIDIT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  logDiditCall(path, res.status, json);
  if (!res.ok) throw new Error(`DIDIT ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function postMultipart(path: string, form: FormData): Promise<Record<string, unknown>> {
  // Sin content-type manual: fetch fija el boundary de multipart/form-data.
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), accept: "application/json" },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(DIDIT_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  logDiditCall(path, res.status, json);
  if (!res.ok) throw new Error(`DIDIT ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

/** Mapea el status de DIDIT (Approved/Declined/In Review) al enum de aml_checks. */
export function mapDiditStatus(raw: unknown): AmlStatus {
  switch (String(raw ?? "").toLowerCase()) {
    case "approved":
      return "passed";
    case "declined":
      return "flagged";
    case "in review":
      return "pending";
    default:
      return "pending";
  }
}

// ------------------------------------------------------------
// Lectura de respuestas y archivos
// ------------------------------------------------------------
type FileRef = { path: string; filename: string };

function firstFileRef(answers: Record<string, unknown>, key: string): FileRef | null {
  const v = answers[key];
  if (Array.isArray(v) && v.length > 0) {
    const f = v[0] as Partial<FileRef>;
    if (f && typeof f.path === "string" && f.path) {
      return { path: f.path, filename: typeof f.filename === "string" ? f.filename : "file" };
    }
  }
  return null;
}

function textAnswer(answers: Record<string, unknown>, key: string): string {
  const v = answers[key];
  return typeof v === "string" ? v.trim() : "";
}

async function downloadBlob(path: string): Promise<Blob> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new Error(`No se pudo leer el archivo ${path}: ${error?.message ?? "vacío"}`);
  return data;
}

/** Toma datos de soporte (texto) de los campos hermanos de una sección por convención de key. */
function siblingText(section: Section, answers: Record<string, unknown>) {
  const get = (re: RegExp): string | undefined => {
    for (const f of section.fields) {
      if (re.test(f.key)) {
        const v = textAnswer(answers, f.key);
        if (v) return v;
      }
    }
    return undefined;
  };
  return {
    dob: get(/birth_date|date_of_birth|dob/i),
    nationality: get(/nationality|nacionalidad/i),
    documentNumber: get(/document_number|doc_number/i),
    entityType: get(/entity_type/i),
    firstName: get(/first_name/i),
    lastName: get(/last_name/i),
    personalNumber: get(/personal_number|curp/i),
    issuingState: get(/issuing_state|issuing/i),
  };
}

// ------------------------------------------------------------
// KYB Registry (registro mercantil de empresas)
// ------------------------------------------------------------
// Search (POST /v3/kyb/search/) es GRATIS y no crea registros en la consola
// DIDIT; select (POST /v3/kyb/select/) es FACTURABLE y crea una sesión
// empresarial (Manual Check). El ciclo es MANUAL (runKybRegistryCheck, botón
// del analista) con fases en result.phase: search → candidate_selection |
// select → completed. Auto-select SOLO con nº de registro declarado + match
// exacto único; nunca por nombre con un único resultado (NAME_ONLY_MATCH).
// El search se envía en modo async (webhook_url): DIDIT responde al instante y
// resuelve en ~90s llamando a /api/webhooks/didit/kyb-search. No hay polling:
// sin webhook la búsqueda es efímera del lado de DIDIT.
const KYB_SELECT_TIMEOUT_MS = 60_000;

// Convenciones de detección (KYB_REG_NUMBER_RE, KYB_COUNTRY_RES…) compartidas
// con el builder: viven en lib/forms/definition.ts. El binding explícito del
// review (kybCountryKey/kybRegNumberKey) tiene prioridad sobre la convención.

/** Como siblingText, pero busca primero en la sección del campo y luego en todo el form. */
function formText(
  sections: Section[],
  si: number,
  answers: Record<string, unknown>,
  re: RegExp,
  exclude?: RegExp,
): string | undefined {
  const scan = (fields: Field[]): string | undefined => {
    for (const f of fields) {
      if (!re.test(f.key) || exclude?.test(f.key)) continue;
      const v = textAnswer(answers, f.key);
      if (v) return v;
    }
    return undefined;
  };
  const own = scan(sections[si]?.fields ?? []);
  if (own) return own;
  for (let i = 0; i < sections.length; i++) {
    if (i === si) continue;
    const v = scan(sections[i].fields);
    if (v) return v;
  }
  return undefined;
}

/** Acepta alpha-3 (los campos tipo `country` guardan alpha-3) o alpha-2 directo. */
function toAlpha2(v: string): string | undefined {
  const s = v.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(s)) return s;
  if (/^[A-Z]{3}$/.test(s)) return alpha3ToAlpha2(s);
  return undefined;
}

function kybCountryAlpha2(
  sections: Section[],
  si: number,
  answers: Record<string, unknown>,
): string | undefined {
  for (const spec of KYB_COUNTRY_RES) {
    const v = formText(sections, si, answers, spec.re, spec.exclude);
    if (v) {
      const a2 = toAlpha2(v);
      if (a2) return a2;
    }
  }
  return undefined;
}

/** Normaliza números de registro para comparación exacta (sin espacios/guiones/puntos). */
function normalizeRegNumber(s: string): string {
  return s.toUpperCase().replace(/[\s.\-\/]+/g, "");
}

const KYB_ACTIVE_RE = /^(active|registered|live|(in\s?)?good\s?standing)/i;
const KYB_INACTIVE_RE =
  /^(dissolved|inactive|liquidat|struck|removed|cancel|revoked|terminated|closed|deregistered)/i;

/** Estado del perfil registral (nodo `kyb_registry` del select) → enum de aml_checks. */
export function mapKybRegistryStatus(node: Record<string, unknown>): AmlStatus {
  if (node.data_resolved === false) return "pending";
  const reg = String(node.registry_status ?? "").trim();
  if (KYB_ACTIVE_RE.test(reg)) return "passed";
  if (KYB_INACTIVE_RE.test(reg)) return "flagged";
  return mapDiditStatus(node.status);
}

/**
 * POST /v3/kyb/select/ — FACTURABLE: trae el perfil registral completo del
 * candidato y crea una sesión empresarial en la consola DIDIT. También lo usa
 * la server action del panel admin (selección manual de candidato).
 */
export async function kybSelect(
  kybResponseId: string,
  vendorData: string,
): Promise<{
  status: AmlStatus;
  externalRef: string | null;
  node: Record<string, unknown>;
  raw: Record<string, unknown>;
}> {
  const json = await postJson(
    "/v3/kyb/select/",
    { kyb_response_id: kybResponseId, vendor_data: vendorData },
    KYB_SELECT_TIMEOUT_MS,
  );
  const node = (json.kyb_registry ?? {}) as Record<string, unknown>;
  return {
    status: mapKybRegistryStatus(node),
    externalRef: (json.request_id as string) || null,
    node,
    raw: json,
  };
}

export type KybDeclared = {
  fieldKey: string;
  name: string;
  registrationNumber?: string;
  country?: string; // alpha-2
};

/** Localiza el campo etiquetado kyb_registry y arma los datos declarados del form. */
export function extractKybDeclared(
  definition: FormDefinition,
  answers: Record<string, unknown>,
): KybDeclared | null {
  const sections = definition.sections;
  for (let si = 0; si < sections.length; si++) {
    for (const f of sections[si].fields) {
      if (f.review?.provider !== "didit" || f.review.feature !== "kyb_registry") continue;
      const declared: KybDeclared = { fieldKey: f.key, name: textAnswer(answers, f.key) };
      // Binding explícito del builder primero; convención de keys como fallback.
      const explicitReg = f.review.kybRegNumberKey
        ? textAnswer(answers, f.review.kybRegNumberKey)
        : "";
      const reg =
        explicitReg ||
        formText(sections, si, answers, KYB_REG_NUMBER_RE, KYB_REG_NUMBER_EXCLUDE_RE);
      if (reg) declared.registrationNumber = reg;
      const explicitCountry = f.review.kybCountryKey
        ? toAlpha2(textAnswer(answers, f.review.kybCountryKey))
        : undefined;
      const country = explicitCountry ?? kybCountryAlpha2(sections, si, answers);
      if (country) declared.country = country;
      return declared;
    }
  }
  return null;
}

// fetch_status del candidato no indica indisponibilidad conocida.
function kybFetchable(c: Record<string, unknown>): boolean {
  return !/(unavailable|not_available|failed|error)/i.test(String(c.fetch_status ?? ""));
}

/**
 * Resuelve una búsqueda registral COMPLETADA (respuesta inmediata del search o
 * payload del callback `kyb.registry_search.resolved`): anota candidatos con su
 * match_reason, aplica las razones de bloqueo del auto-select estricto y, si
 * procede, ejecuta el select FACTURABLE con reserva atómica. Compartida entre
 * `runKybRegistryCheck` y el webhook /api/webhooks/didit/kyb-search.
 */
export async function resolveKybSearch(input: {
  checkId: string;
  declaredJson: Record<string, unknown>;
  /** Respuesta del search o body del callback (ambos traen `kyb_registry`). */
  search: Record<string, unknown>;
  searchRef: string | null;
  /** external_ref de la solicitud (vendor_data para el select). */
  vendorData: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const { checkId, declaredJson, search, searchRef, vendorData } = input;
  const setRow = (patch: Record<string, unknown>) =>
    supabase.from("aml_checks").update(patch).eq("id", checkId);

  const regNode = (search.kyb_registry ?? {}) as Record<string, unknown>;
  const companies = (
    Array.isArray(regNode.companies) ? regNode.companies : []
  ) as Record<string, unknown>[];
  if (!companies.length) {
    await setRow({
      status: "flagged",
      external_ref: searchRef,
      result: { phase: "completed", declared: declaredJson, kyb_search: search, reason: "no_candidates" },
    });
    return;
  }

  // Candidatos anotados con el motivo de coincidencia (para el picker).
  const declaredReg =
    typeof declaredJson.registration_number === "string" ? declaredJson.registration_number : "";
  const target = declaredReg ? normalizeRegNumber(declaredReg) : null;
  const candidates: Record<string, unknown>[] = companies.slice(0, 25).map((c) => ({
    ...c,
    match_reason:
      target && normalizeRegNumber(String(c.registration_number ?? "")) === target
        ? "exact_registration_number"
        : "name_result",
  }));
  const exact = candidates.filter((c) => c.match_reason === "exact_registration_number");

  // Auto-select estricto. companies.length === 1 por nombre NO basta: un único
  // resultado por nombre puede ser la empresa equivocada.
  let blocked: string | null = null;
  if (!target) blocked = "NAME_ONLY_MATCH";
  else if (exact.length === 0) blocked = "NO_EXACT_REGISTRATION_MATCH";
  else if (exact.length > 1) blocked = "MULTIPLE_EXACT_MATCHES";
  else if (!kybFetchable(exact[0])) blocked = "CANDIDATE_NOT_FETCHABLE";

  const baseResult = { declared: declaredJson, kyb_search: search, candidates };
  if (blocked) {
    await setRow({
      external_ref: searchRef,
      result: { phase: "candidate_selection", ...baseResult, autoSelectBlockedReason: blocked },
    });
    return;
  }

  // --- reserva atómica ANTES del select facturable ---
  const chosen = exact[0];
  const kybResponseId = String(chosen.kyb_response_id ?? "");
  const selected = {
    kyb_response_id: kybResponseId,
    by: "auto",
    at: new Date().toISOString(),
    select_attempted: true,
    billing_state: "unknown",
  };
  const { data: reserved } = await supabase
    .from("aml_checks")
    .update({ external_ref: searchRef, result: { phase: "select", ...baseResult, selected } })
    .eq("id", checkId)
    .eq("status", "pending")
    .select("id");
  if (!reserved?.length) return; // otro proceso resolvió la fila

  try {
    const sel = await kybSelect(kybResponseId, vendorData);
    await setRow({
      status: sel.status,
      external_ref: sel.externalRef ?? searchRef,
      result: {
        phase: sel.status === "pending" ? "select" : "completed",
        ...baseResult,
        selected: { ...selected, billing_state: "charged" },
        kyb_registry: sel.node,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/\s4\d\d:/.test(msg)) {
      // DIDIT rechazó el select (no facturó): el ciclo termina en error y un
      // nuevo run parte de cero (search gratis).
      await setRow({ status: "error", result: { phase: "search", ...baseResult, error: msg } });
    } else {
      // Enviado sin confirmación: pudo facturarse. Queda pending/select/unknown
      // — sin reintentos automáticos ni manuales (verificar en consola DIDIT).
      await setRow({
        result: { phase: "select", ...baseResult, selected: { ...selected, error: msg } },
      });
    }
  }
}

/**
 * Ciclo MANUAL de validación registral (lo dispara el analista). Maneja su
 * propia fila en aml_checks con fases explícitas y reserva atómica antes del
 * select facturable:
 * - search sin candidatos → flagged/completed (reason no_candidates)
 * - candidatos sin auto-select → pending/candidate_selection (el analista elige)
 * - auto-select (nº exacto único) → reserva (select_attempted, billing unknown)
 *   → select → completed; fallo ambiguo queda pending/select SIN reintentos.
 * Un run nuevo con una fila pending en candidate_selection la cierra como
 * `superseded` (error, gratis); una fila pending con select_attempted bloquea.
 */
export async function runKybRegistryCheck(input: {
  requestId: string;
  externalRef: string;
  definition: FormDefinition;
  answers: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const declared = extractKybDeclared(input.definition, input.answers);
  if (!declared) return { ok: false, error: "no_tagged_field" };
  if (!declared.country) return { ok: false, error: "missing_country" };
  if (!declared.name && !declared.registrationNumber) return { ok: false, error: "missing_name" };

  // Ciclos en vuelo: select ya intentado → intocable; candidate_selection → se
  // supersede (cerrarla es gratis; el historial queda como evidencia).
  const { data: inflight } = await supabase
    .from("aml_checks")
    .select("id, result")
    .eq("request_id", input.requestId)
    .eq("provider", "didit")
    .eq("feature", "kyb_registry")
    .eq("status", "pending");
  for (const row of inflight ?? []) {
    const res = (row.result ?? {}) as Record<string, unknown>;
    const sel = res.selected as Record<string, unknown> | undefined;
    if (sel?.select_attempted) return { ok: false, error: "cycle_in_progress" };
    await supabase
      .from("aml_checks")
      .update({ status: "error", result: { ...res, phase: "completed", reason: "superseded" } })
      .eq("id", row.id)
      .eq("status", "pending");
  }

  const declaredJson = {
    name: declared.name,
    registration_number: declared.registrationNumber ?? null,
    country: declared.country,
  };

  // Fase search: la fila existe desde el inicio (la búsqueda tarda ~90s y así
  // el panel puede mostrar "Buscando empresa" si se refresca).
  const { data: inserted, error: insertError } = await supabase
    .from("aml_checks")
    .insert({
      request_id: input.requestId,
      provider: "didit",
      feature: "kyb_registry",
      field_key: declared.fieldKey,
      external_ref: null,
      status: "pending",
      score: null,
      result: { phase: "search", declared: declaredJson },
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "insert_failed" };
  }
  const checkId = inserted.id as string;
  const setRow = (patch: Record<string, unknown>) =>
    supabase.from("aml_checks").update(patch).eq("id", checkId);

  // --- search async (gratis): DIDIT responde al instante y resuelve en ~90s
  // llamando a nuestro webhook con el token por-búsqueda. Sin webhook_url la
  // búsqueda sería efímera (no hay polling).
  const searchToken = randomUUID();
  let search: Record<string, unknown>;
  try {
    const body: Record<string, unknown> = {
      country_code: declared.country,
      vendor_data: input.externalRef,
      webhook_url: `${env.appUrl().replace(/\/+$/, "")}/api/webhooks/didit/kyb-search?t=${searchToken}`,
    };
    if (declared.registrationNumber) body.registration_number = declared.registrationNumber;
    else body.name = declared.name;
    search = await postJson("/v3/kyb/search/", body);
  } catch (e) {
    await setRow({
      status: "error",
      result: {
        phase: "search",
        declared: declaredJson,
        error: e instanceof Error ? e.message : String(e),
      },
    });
    return { ok: true };
  }
  const regNode = (search.kyb_registry ?? {}) as Record<string, unknown>;
  const searchRef = (search.request_id as string) || null;

  if (search.search_resolved === true || regNode.search_resolved === true) {
    // Resolución inmediata (registro cacheado): mismo camino que el callback.
    await resolveKybSearch({
      checkId,
      declaredJson,
      search,
      searchRef,
      vendorData: input.externalRef,
    });
    return { ok: true };
  }

  // Pendiente: la fila espera el callback kyb.registry_search.resolved. El
  // token autentica el callback (viene sin firma de DIDIT).
  await setRow({
    external_ref: searchRef,
    result: {
      phase: "search",
      declared: declaredJson,
      kyb_search: search,
      search_token: searchToken,
    },
  });
  return { ok: true };
}

// ------------------------------------------------------------
// Dispatcher
// ------------------------------------------------------------
type TaggedField = { field: Field; si: number };
type TaskResult = {
  status: AmlStatus;
  score: number | null;
  externalRef: string | null;
  result: Record<string, unknown>;
};

/**
 * Recorre los campos etiquetados con `field.review` (provider "didit"), agrupa
 * por feature (los casos combinación consumen varios campos) y llama al endpoint
 * standalone correspondiente. Devuelve una fila por verificación. Los errores
 * por-feature se capturan como fila `error` (no abortan las demás).
 */
export async function dispatchDiditReviews(input: {
  requestId: string;
  externalRef: string;
  definition: FormDefinition;
  answers: Record<string, unknown>;
  /** Claves `feature:fieldKey` ya verificadas (se saltan; permite reanudar). */
  skip?: Set<string>;
  /** Persiste cada verificación apenas completa (progreso parcial resiliente). */
  onRow?: (row: DiditCheckRow) => Promise<void> | void;
}): Promise<DiditCheckRow[]> {
  const { definition, answers, externalRef } = input;
  const sections = definition.sections;
  const rows: DiditCheckRow[] = [];

  const tagged: TaggedField[] = [];
  sections.forEach((s, si) =>
    s.fields.forEach((field) => {
      if (field.review?.provider === "didit") tagged.push({ field, si });
    }),
  );
  console.log(
    `[DIDIT] request=${input.requestId} apiKey=${env.diditApiKey() ? "set" : "MISSING"} ` +
      `tagged=${tagged.length} features=[${tagged.map((t) => t.field.review?.feature).join(",")}]`,
  );
  if (!tagged.length) {
    console.warn(
      `[DIDIT] request=${input.requestId} sin campos con revisión DIDIT; no se llamará a ningún endpoint`,
    );
    return rows;
  }

  const byFeature = (feat: DiditFeature) => tagged.filter((t) => t.field.review?.feature === feat);

  // Todos los campos de imagen (file/selfie), etiquetados o no — para resolver la
  // referencia de face_match aunque no haya un id_verification (caso "solo face match").
  const allImageFields: TaggedField[] = [];
  sections.forEach((s, si) =>
    s.fields.forEach((field) => {
      if (field.type === "file" || field.type === "selfie") allImageFields.push({ field, si });
    }),
  );

  // Cada verificación se encola para correr en paralelo. La tarea aísla su
  // propio error (empuja una fila `error`), así que `Promise.all` nunca rechaza.
  const tasks: Promise<void>[] = [];
  function run(feature: DiditFeature, fieldKey: string | null, fn: () => Promise<TaskResult>) {
    // Saltar lo ya verificado con éxito en una corrida previa (reanudable).
    if (input.skip?.has(`${feature}:${fieldKey ?? ""}`)) return;
    tasks.push(
      (async () => {
        let row: DiditCheckRow;
        try {
          const res = await fn();
          console.log(
            `[DIDIT] request=${input.requestId} feature=${feature} field=${fieldKey ?? "-"} status=${res.status} score=${res.score ?? "-"}`,
          );
          row = { feature, fieldKey, ...res };
        } catch (e) {
          console.error(
            `[DIDIT] request=${input.requestId} feature=${feature} field=${fieldKey ?? "-"} falló:`,
            e instanceof Error ? e.message : String(e),
          );
          row = {
            feature,
            fieldKey,
            externalRef: null,
            status: "error",
            score: null,
            result: { error: e instanceof Error ? e.message : String(e) },
          };
        }
        rows.push(row);
        // Persiste apenas completa: si el background se corta, no se pierde.
        if (input.onRow) await input.onRow(row);
      })(),
    );
  }

  const idFields = byFeature("id_verification");
  const fieldByKey = new Map<string, Field>();
  sections.forEach((s) => s.fields.forEach((f) => fieldByKey.set(f.key, f)));

  // Documento (frente/reverso) a partir de los refKeys de un face_match.
  const docFromRefKeys = (refKeys: string[] | undefined): { frontKey?: string; backKey?: string } => {
    if (!refKeys?.length) return {};
    const backKey = refKeys.find((k) => /back|reverso/i.test(k));
    const frontKey = refKeys.find((k) => k !== backKey) ?? refKeys[0];
    return { frontKey, backKey };
  };
  const isIdVerification = (key: string | undefined): boolean => {
    const rev = key ? fieldByKey.get(key)?.review : undefined;
    return rev?.provider === "didit" && rev.feature === "id_verification";
  };

  // Una llamada id_verification para un documento (frente + reverso opcional).
  const idVerificationCall = async (frontKey: string, backKey?: string): Promise<TaskResult> => {
    const front = firstFileRef(answers, frontKey);
    if (!front) throw new Error("Falta la imagen del documento (frente)");
    const fd = new FormData();
    fd.append("front_image", await downloadBlob(front.path), front.filename);
    if (backKey) {
      const back = firstFileRef(answers, backKey);
      if (back) fd.append("back_image", await downloadBlob(back.path), back.filename);
    }
    fd.append("vendor_data", externalRef);
    const json = await postMultipart("/v3/id-verification/", fd);
    const node = (json.id_verification ?? {}) as Record<string, unknown>;
    return {
      status: mapDiditStatus(node.status),
      score: null,
      externalRef: (json.request_id as string) || null,
      result: json,
    };
  };

  // --- id_verification (opt-in, POR documento) ---
  const consumed = new Set<string>();
  // (a) Documento enlazado a un face_match cuyo frente esté etiquetado id_verification.
  for (const t of byFeature("face_match")) {
    const { frontKey, backKey } = docFromRefKeys(t.field.review?.refKeys);
    if (!frontKey || consumed.has(frontKey) || !isIdVerification(frontKey)) continue;
    consumed.add(frontKey);
    if (backKey) consumed.add(backKey);
    run("id_verification", frontKey, () => idVerificationCall(frontKey, backKey));
  }
  // (b) id_verification no consumido → agrupado por sección (un documento por sección).
  const idBySection = new Map<number, TaggedField[]>();
  for (const t of idFields) {
    if (consumed.has(t.field.key)) continue;
    const arr = idBySection.get(t.si) ?? [];
    arr.push(t);
    idBySection.set(t.si, arr);
  }
  for (const group of idBySection.values()) {
    const backField = group.find((g) => /back|reverso/i.test(g.field.key));
    const frontField = group.find((g) => g !== backField) ?? group[0];
    run("id_verification", frontField.field.key, () =>
      idVerificationCall(frontField.field.key, backField?.field.key),
    );
  }

  // --- face_match: selfie (user_image) + frente del documento enlazado (ref_image) ---
  for (const t of byFeature("face_match")) {
    run("face_match", t.field.key, async () => {
      const selfie = firstFileRef(answers, t.field.key);
      if (!selfie) throw new Error("Falta la selfie");
      // Referencia = frente del documento enlazado (refKeys). Sin binding → heurística de
      // respaldo (frente de imagen sin etiqueta o id_verification, misma sección primero).
      let ref: FileRef | null = null;
      const { frontKey } = docFromRefKeys(t.field.review?.refKeys);
      if (frontKey) {
        ref = firstFileRef(answers, frontKey);
      } else {
        const refScore = (c: TaggedField) =>
          (c.si === t.si ? 0 : 2) + (c.field.review?.feature === "id_verification" ? 0 : 1);
        const refCandidates = allImageFields
          .filter((c) => c.field.key !== t.field.key)
          .filter((c) => {
            const rev = c.field.review;
            return !rev || rev.provider !== "didit" || rev.feature === "id_verification";
          })
          .filter((c) => !/back|reverso/i.test(c.field.key))
          .sort((a, b) => refScore(a) - refScore(b));
        for (const c of refCandidates) {
          ref = firstFileRef(answers, c.field.key);
          if (ref) break;
        }
      }
      if (!ref) throw new Error("NO_REFERENCE: falta la imagen de referencia (frente del documento)");
      const fd = new FormData();
      fd.append("user_image", await downloadBlob(selfie.path), selfie.filename);
      fd.append("ref_image", await downloadBlob(ref.path), ref.filename);
      fd.append("vendor_data", externalRef);
      const json = await postMultipart("/v3/face-match/", fd);
      const node = (json.face_match ?? {}) as Record<string, unknown>;
      return {
        status: mapDiditStatus(node.status),
        score: typeof node.score === "number" ? node.score : null,
        externalRef: (json.request_id as string) || null,
        result: json,
      };
    });
  }

  // --- aml_screening: full_name (campo etiquetado) + soporte de hermanos ---
  for (const t of byFeature("aml_screening")) {
    run("aml_screening", t.field.key, async () => {
      const fullName = textAnswer(answers, t.field.key);
      if (!fullName) throw new Error("Falta el nombre completo para AML");
      const sib = siblingText(sections[t.si], answers);
      const body: Record<string, unknown> = { full_name: fullName, vendor_data: externalRef };
      if (sib.dob) body.date_of_birth = sib.dob;
      if (sib.nationality) body.nationality = sib.nationality;
      if (sib.documentNumber) body.document_number = sib.documentNumber;
      if (sib.entityType) body.entity_type = sib.entityType;
      const json = await postJson("/v3/aml/", body);
      const node = (json.aml ?? {}) as Record<string, unknown>;
      return {
        status: mapDiditStatus(node.status),
        score: typeof node.score === "number" ? node.score : null,
        externalRef: (json.request_id as string) || null,
        result: json,
      };
    });
  }

  // --- proof_of_address: documento (una llamada por campo) ---
  for (const t of byFeature("proof_of_address")) {
    run("proof_of_address", t.field.key, async () => {
      const doc = firstFileRef(answers, t.field.key);
      if (!doc) throw new Error("Falta el comprobante de domicilio");
      const fd = new FormData();
      fd.append("document", await downloadBlob(doc.path), doc.filename);
      fd.append("vendor_data", externalRef);
      const json = await postMultipart("/v3/poa/", fd);
      const node = (json.poa ?? json.proof_of_address ?? {}) as Record<string, unknown>;
      return {
        status: mapDiditStatus(node.status),
        score: null,
        externalRef: (json.request_id as string) || null,
        result: json,
      };
    });
  }

  // --- age_estimation / liveness: selfie (user_image) ---
  const IMG_FEATURES: { feature: DiditFeature; path: string; key: string }[] = [
    { feature: "age_estimation", path: "/v3/age-estimation/", key: "age_estimation" },
    { feature: "liveness", path: "/v3/passive-liveness/", key: "liveness" },
  ];
  for (const spec of IMG_FEATURES) {
    for (const t of byFeature(spec.feature)) {
      run(spec.feature, t.field.key, async () => {
        const img = firstFileRef(answers, t.field.key);
        if (!img) throw new Error("Falta la imagen (selfie)");
        const fd = new FormData();
        fd.append("user_image", await downloadBlob(img.path), img.filename);
        fd.append("vendor_data", externalRef);
        const json = await postMultipart(spec.path, fd);
        const node = (json[spec.key] ?? {}) as Record<string, unknown>;
        return {
          status: mapDiditStatus(node.status),
          score: typeof node.score === "number" ? node.score : null,
          externalRef: (json.request_id as string) || null,
          result: json,
        };
      });
    }
  }

  // --- database_validation: datos de texto de la sección ---
  for (const t of byFeature("database_validation")) {
    run("database_validation", t.field.key, async () => {
      const sib = siblingText(sections[t.si], answers);
      const body: Record<string, unknown> = { vendor_data: externalRef };
      if (sib.firstName) body.first_name = sib.firstName;
      if (sib.lastName) body.last_name = sib.lastName;
      if (sib.dob) body.date_of_birth = sib.dob;
      if (sib.personalNumber) body.personal_number = sib.personalNumber;
      if (sib.issuingState) body.issuing_state = sib.issuingState;
      const json = await postJson("/v3/database-validation/", body);
      const node = (json.database_validation ?? {}) as Record<string, unknown>;
      return {
        status: mapDiditStatus(node.status),
        score: null,
        externalRef: (json.request_id as string) || null,
        result: json,
      };
    });
  }

  // Nota: kyb_registry NO se despacha aquí — es un ciclo manual del analista
  // (runKybRegistryCheck), disparado desde el panel de la solicitud.

  // Ejecuta todas las verificaciones encoladas en paralelo (cada una aísla su error).
  await Promise.all(tasks);
  return rows;
}

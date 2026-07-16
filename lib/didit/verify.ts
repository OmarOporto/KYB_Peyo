import "server-only";
import { env } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import type { AmlStatus } from "@/lib/kyb/types";
import type { DiditFeature, Field, FormDefinition, Section } from "@/lib/forms/definition";

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

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
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
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
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
  if (!tagged.length) return rows;

  const byFeature = (feat: DiditFeature) => tagged.filter((t) => t.field.review?.feature === feat);

  // Todos los campos de imagen (file/selfie), etiquetados o no — para resolver la
  // referencia de face_match aunque no haya un id_verification (caso "solo face match").
  const allImageFields: TaggedField[] = [];
  sections.forEach((s, si) =>
    s.fields.forEach((field) => {
      if (field.type === "file" || field.type === "selfie") allImageFields.push({ field, si });
    }),
  );

  async function run(feature: DiditFeature, fieldKey: string | null, fn: () => Promise<TaskResult>) {
    try {
      rows.push({ feature, fieldKey, ...(await fn()) });
    } catch (e) {
      rows.push({
        feature,
        fieldKey,
        externalRef: null,
        status: "error",
        score: null,
        result: { error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  const idFields = byFeature("id_verification");

  // --- id_verification: front + back en UNA llamada ---
  if (idFields.length) {
    const backField = idFields.find((t) => /back|reverso/i.test(t.field.key));
    const frontField = idFields.find((t) => t !== backField) ?? idFields[0];
    await run("id_verification", frontField.field.key, async () => {
      const front = firstFileRef(answers, frontField.field.key);
      if (!front) throw new Error("Falta la imagen del documento (frente)");
      const fd = new FormData();
      fd.append("front_image", await downloadBlob(front.path), front.filename);
      if (backField) {
        const back = firstFileRef(answers, backField.field.key);
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
    });
  }

  // --- face_match: selfie (user_image) + documento frente (ref_image) ---
  for (const t of byFeature("face_match")) {
    await run("face_match", t.field.key, async () => {
      const selfie = firstFileRef(answers, t.field.key);
      if (!selfie) throw new Error("Falta la selfie");
      // Referencia (ref_image): el FRENTE de un documento. Puede venir de un campo
      // id_verification (caso KYC: comparte el documento) o de un campo de imagen SIN
      // etiqueta DIDIT (caso "solo face match", sin correr id_verification). Se excluye
      // la propia selfie y el reverso; el frente es obligatorio. Prioriza: misma sección
      // que la selfie, y documento id_verification; si no, busca en todo el formulario
      // (funciona entre secciones).
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
      let ref: FileRef | null = null;
      for (const c of refCandidates) {
        ref = firstFileRef(answers, c.field.key);
        if (ref) break;
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
    await run("aml_screening", t.field.key, async () => {
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
    await run("proof_of_address", t.field.key, async () => {
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
      await run(spec.feature, t.field.key, async () => {
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
    await run("database_validation", t.field.key, async () => {
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

  return rows;
}

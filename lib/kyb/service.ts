import "server-only";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken, hashToken } from "@/lib/tokens";
import { env } from "@/lib/env";
import { getAmlProvider } from "@/lib/aml";
import { buildAmlSubject } from "@/lib/aml/mapping";
import { dispatchDiditReviews, type DiditCheckRow } from "@/lib/didit/verify";
import { notifyClient } from "@/lib/kyb/webhook";
import { resolveRequestDefinition } from "@/lib/forms/store";
import { reachableFields } from "@/lib/forms/logic";
import { fileRefsOf } from "@/lib/forms/answers";
import { FORM_VERSION } from "@/lib/forms/schema";
import type {
  KybCorrectionField,
  KybCorrections,
  KybDecision,
  KybRequest,
  KybStatus,
} from "@/lib/kyb/types";

const DEFAULT_TTL_HOURS = 24 * 14; // 14 días

export const DOCUMENTS_BUCKET = "kyb-documents";

interface AuditInput {
  requestId: string | null;
  actor: string;
  action: string;
  fromStatus?: KybStatus | null;
  toStatus?: KybStatus | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(input: AuditInput) {
  const supabase = createServiceClient();
  await supabase.from("audit_log").insert({
    request_id: input.requestId,
    actor: input.actor,
    action: input.action,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    metadata: input.metadata ?? null,
  });
}

/** Crea una solicitud KYB y devuelve el token en claro (solo aquí). */
export async function createRequest(
  externalRef: string,
  ttlHours = DEFAULT_TTL_HOURS,
  formId?: string | null,
  formDefinition?: unknown,
  opts?: {
    apiKeyId?: string | null;
    webhookEndpointId?: string | null;
    returnUrl?: string | null;
  },
): Promise<{
  id: string;
  token: string;
  invitationUrl: string;
  expiresAt: string;
}> {
  const supabase = createServiceClient();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from("kyb_requests")
    .insert({
      external_ref: externalRef,
      invitation_token_hash: hashToken(token),
      token_expires_at: expiresAt,
      form_version: FORM_VERSION,
      status: "created",
      form_id: formId ?? null,
      // Snapshot de la definición para validar el envío contra lo que el
      // solicitante realmente llenó (aunque el form se edite después).
      form_definition: formDefinition ?? null,
      // Aislamiento por cliente: la solicitud pertenece a la API key que la creó.
      api_key_id: opts?.apiKeyId ?? null,
      webhook_endpoint_id: opts?.webhookEndpointId ?? null,
      return_url: opts?.returnUrl ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Fila de respuestas vacía para autosave.
  await supabase.from("kyb_form_responses").insert({
    request_id: data.id,
    data: {},
    form_version: FORM_VERSION,
  });

  await logAudit({
    requestId: data.id,
    actor: "system",
    action: "request_created",
    toStatus: "created",
    metadata: { externalRef },
  });

  return {
    id: data.id as string,
    token,
    invitationUrl: `${env.appUrl()}/f/${token}`,
    expiresAt,
  };
}

/**
 * Emite un token de invitación NUEVO para una solicitud (rota el hash y el
 * vencimiento). No cambia el estado; el llamador decide la transición. Devuelve
 * el token en claro (solo aquí) y el link. Reutilizado por `reissueInvitation`
 * (re-emitir link) y `requestChanges` (ciclo de correcciones).
 */
async function issueToken(
  requestId: string,
  ttlHours = DEFAULT_TTL_HOURS,
): Promise<{ token: string; expiresAt: string; invitationUrl: string }> {
  const supabase = createServiceClient();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  await supabase
    .from("kyb_requests")
    .update({
      invitation_token_hash: hashToken(token),
      token_expires_at: expiresAt,
      // Nuevo ciclo de link → puede volver a avisar "por vencer".
      expiring_notified_at: null,
    })
    .eq("id", requestId);
  return { token, expiresAt, invitationUrl: `${env.appUrl()}/f/${token}` };
}

/**
 * Re-emite el link de invitación de una solicitud existente (conserva el
 * borrador). Útil si el cliente perdió el link o expiró. También admite
 * `changes_requested`: tras pedir correcciones (sobre todo desde el panel del
 * analista) la app externa necesita un link fresco que enviar al solicitante,
 * ya que el token solo existe en claro al emitirse. Rechaza solicitudes cerradas.
 */
export async function reissueInvitation(
  requestId: string,
  ttlHours = DEFAULT_TTL_HOURS,
): Promise<
  | { ok: true; invitationUrl: string; token: string; expiresAt: string }
  | { ok: false; error: string }
> {
  const supabase = createServiceClient();
  const { data: req } = await supabase
    .from("kyb_requests")
    .select("id, status")
    .eq("id", requestId)
    .single();
  if (!req) return { ok: false, error: "Solicitud no encontrada" };

  const status = req.status as KybStatus;
  if (!["created", "in_progress", "expired", "changes_requested"].includes(status)) {
    return {
      ok: false,
      error: "La solicitud ya fue enviada o cerrada; no admite re-emitir el link.",
    };
  }

  const { token, expiresAt, invitationUrl } = await issueToken(requestId, ttlHours);

  if (status === "expired") {
    // Reactivar: in_progress si ya había borrador, si no created.
    const { data: draft } = await supabase
      .from("kyb_form_responses")
      .select("data")
      .eq("request_id", requestId)
      .maybeSingle();
    const hasDraft =
      draft?.data && Object.keys(draft.data as Record<string, unknown>).length > 0;
    await setStatus(
      requestId,
      hasDraft ? "in_progress" : "created",
      "expired",
      "system",
      "invitation_reissued",
    );
  } else {
    await logAudit({ requestId, actor: "system", action: "invitation_reissued" });
  }

  return { ok: true, invitationUrl, token, expiresAt };
}

/**
 * Estados "pre-envío" en los que el link de invitación todavía le importa al
 * solicitante. Solo estos se expiran por tiempo y emiten `request.expired`.
 */
const PRE_SUBMIT_STATUSES: KybStatus[] = ["created", "in_progress", "changes_requested"];

/**
 * Transición atómica a `expired` (compare-and-set): solo cambia si la fila sigue
 * en `fromStatus`. Devuelve `true` si ESTA llamada hizo la transición — así el
 * webhook `request.expired` se emite exactamente una vez entre la ruta perezosa
 * (`getRequestByToken`) y el barrido cron (`expireDueRequests`). Audita.
 */
async function expireRequest(
  requestId: string,
  fromStatus: KybStatus,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("kyb_requests")
    .update({ status: "expired" })
    .eq("id", requestId)
    .eq("status", fromStatus)
    .select("id")
    .maybeSingle();
  if (!data) return false;
  await logAudit({
    requestId,
    actor: "system",
    action: "token_expired",
    fromStatus,
    toStatus: "expired",
  });
  return true;
}

/** Resuelve una solicitud a partir del token de invitación (valida expiración). */
export async function getRequestByToken(
  token: string,
): Promise<KybRequest | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("kyb_requests")
    .select("*")
    .eq("invitation_token_hash", hashToken(token))
    .maybeSingle();

  if (!data) return null;
  const req = data as KybRequest;

  if (req.token_expires_at && new Date(req.token_expires_at) < new Date()) {
    if (req.status !== "expired" && !isTerminal(req.status)) {
      const transitioned = await expireRequest(req.id, req.status);
      // Emite el evento solo si esta llamada hizo la transición y era un estado
      // pre-envío (donde el link aún importaba). En background para no bloquear.
      if (transitioned && PRE_SUBMIT_STATUSES.includes(req.status)) {
        after(() => notifyClient(req.id, "request.expired"));
      }
    }
    return { ...req, status: "expired" };
  }
  return req;
}

/**
 * Barrido programado (cron): expira las solicitudes cuyo link ya venció y que
 * siguen esperando al solicitante (pre-envío). Devuelve los ids realmente
 * expirados para que el llamador dispare el webhook `request.expired`.
 */
export async function expireDueRequests(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data: due } = await supabase
    .from("kyb_requests")
    .select("id, status")
    .lt("token_expires_at", new Date().toISOString())
    .in("status", PRE_SUBMIT_STATUSES);

  const expired: string[] = [];
  for (const row of due ?? []) {
    const ok = await expireRequest(row.id as string, row.status as KybStatus);
    if (ok) expired.push(row.id as string);
  }
  return expired;
}

/** Ventana (días) del aviso proactivo antes del vencimiento del link. */
const EXPIRING_WINDOW_DAYS = 3;

/**
 * Barrido programado (cron): avisa "por vencer" las solicitudes pre-envío cuyo
 * link vence dentro de los próximos `windowDays` y que **aún no** han sido
 * avisadas. El `UPDATE` con guard `expiring_notified_at IS NULL` es atómico y
 * garantiza **un solo aviso** por ciclo de link (se reinicia al re-emitir el
 * link en `issueToken`). Devuelve los ids para disparar `request.expiring`.
 */
export async function notifyExpiringSoonRequests(
  windowDays = EXPIRING_WINDOW_DAYS,
): Promise<string[]> {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const windowIso = new Date(Date.now() + windowDays * 86_400_000).toISOString();

  const { data } = await supabase
    .from("kyb_requests")
    .update({ expiring_notified_at: nowIso })
    .in("status", PRE_SUBMIT_STATUSES)
    .is("expiring_notified_at", null)
    .gt("token_expires_at", nowIso) // aún NO vencido → avisamos ANTES
    .lt("token_expires_at", windowIso) // dentro de la ventana
    .select("id");

  return (data ?? []).map((r) => r.id as string);
}

export function isTerminal(status: KybStatus): boolean {
  return status === "approved" || status === "rejected" || status === "expired";
}

async function setStatus(
  requestId: string,
  to: KybStatus,
  from: KybStatus,
  actor: string,
  action: string,
  extra: Record<string, unknown> = {},
) {
  const supabase = createServiceClient();
  await supabase
    .from("kyb_requests")
    .update({ status: to, ...extra })
    .eq("id", requestId);
  await logAudit({
    requestId,
    actor,
    action,
    fromStatus: from,
    toStatus: to,
  });
}

/** Guarda el borrador del formulario (autosave). */
export async function saveDraft(
  requestId: string,
  data: Record<string, unknown>,
) {
  const supabase = createServiceClient();
  await supabase
    .from("kyb_form_responses")
    .upsert(
      { request_id: requestId, data, form_version: FORM_VERSION },
      { onConflict: "request_id" },
    );

  // created -> in_progress en el primer guardado.
  const { data: req } = await supabase
    .from("kyb_requests")
    .select("status")
    .eq("id", requestId)
    .single();
  if (req?.status === "created") {
    await setStatus(requestId, "in_progress", "created", "applicant", "draft_saved");
  }
}

export async function getDraft(
  requestId: string,
): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("kyb_form_responses")
    .select("data")
    .eq("request_id", requestId)
    .maybeSingle();
  return (data?.data as Record<string, unknown>) ?? {};
}

/**
 * Genera URLs firmadas (temporales) para varios documentos del bucket privado.
 * Devuelve un mapa `path -> signedUrl`; omite los que fallen. Usado por el
 * detalle del request en admin para mostrar miniaturas inline.
 */
export async function createSignedDocUrls(
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};

  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(unique, expiresIn);
  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

/** Registra los metadatos de un documento subido a Storage. */
export async function recordDocument(input: {
  requestId: string;
  docType: string;
  storagePath: string;
  filename: string;
  mime?: string | null;
  size?: number | null;
}) {
  const supabase = createServiceClient();
  await supabase.from("kyb_documents").insert({
    request_id: input.requestId,
    doc_type: input.docType,
    storage_path: input.storagePath,
    filename: input.filename,
    mime: input.mime ?? null,
    size: input.size ?? null,
  });
}

/** Elimina un documento de Storage y su fila de metadatos. */
export async function deleteDocument(input: {
  requestId: string;
  storagePath: string;
}) {
  const supabase = createServiceClient();
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([input.storagePath]);
  await supabase
    .from("kyb_documents")
    .delete()
    .eq("request_id", input.requestId)
    .eq("storage_path", input.storagePath);
}

/**
 * Finaliza el formulario (parte rápida): guarda datos y pasa a `submitted`.
 * Las verificaciones (DIDIT/AML) se disparan aparte con {@link runVerifications}
 * en segundo plano para no bloquear la respuesta al usuario.
 */
export async function submitRequest(
  requestId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: req } = await supabase
    .from("kyb_requests")
    .select("id, status, form_id, form_definition")
    .eq("id", requestId)
    .single();
  if (!req) throw new Error("Solicitud no encontrada");
  if (isTerminal(req.status)) throw new Error("La solicitud ya está cerrada");

  // Prune del camino inalcanzable: si el solicitante cambió una bifurcación
  // (p. ej. en el ciclo de correcciones), descarta del blob las respuestas de
  // ramas que ya no se recorren, para no persistir datos de un camino abandonado.
  // Solo en el envío (respuestas finales); NUNCA en el autosave, donde una rama
  // aún no alcanzada es legítima. Y solo para solicitudes con formulario dinámico
  // propio (snapshot o form_id): en el legacy `resolveRequestDefinition` caería al
  // form publicado por defecto —con otras keys— y borraría respuestas válidas.
  let toSave = data;
  const isDynamic =
    !!(req as { form_definition?: unknown }).form_definition ||
    !!(req as { form_id?: string | null }).form_id;
  if (isDynamic) {
    const definition = await resolveRequestDefinition(
      (req as { form_definition?: unknown }).form_definition,
      (req as { form_id?: string | null }).form_id,
    );
    if (definition) {
      const keep = new Set(reachableFields(definition, data).map((f) => f.key));
      toSave = Object.fromEntries(
        Object.entries(data).filter(([k]) => keep.has(k)),
      );
    }
  }

  await supabase
    .from("kyb_form_responses")
    .upsert(
      { request_id: requestId, data: toSave, form_version: FORM_VERSION },
      { onConflict: "request_id" },
    );

  // `corrections: null` cierra la ronda de correcciones abierta (si venía de
  // `changes_requested`); en el flujo normal ya era null.
  await supabase
    .from("kyb_requests")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      corrections: null,
    })
    .eq("id", requestId);
  await logAudit({
    requestId,
    actor: "applicant",
    action: "form_submitted",
    fromStatus: req.status,
    toStatus: "submitted",
  });
}

/**
 * Dispara las verificaciones (DIDIT real por-feature o mock) y pasa la solicitud
 * a `under_review`. Pensada para correr en segundo plano (Next `after`) después
 * de {@link submitRequest}: es idempotente (solo actúa sobre solicitudes en
 * estado `submitted`) y relee las respuestas ya persistidas.
 */
export async function runVerifications(
  requestId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const supabase = createServiceClient();
  const { data: req } = await supabase
    .from("kyb_requests")
    .select("id, status, external_ref, form_id, form_definition")
    .eq("id", requestId)
    .single();
  if (!req) {
    console.error(`[AML] request=${requestId} no encontrada; se omiten verificaciones`);
    return;
  }
  // Idempotencia: solo verificar una solicitud enviada. `force` (re-run manual del
  // admin) permite reanudar una que quedó a medias.
  if (!opts.force && req.status !== "submitted") {
    console.warn(
      `[AML] request=${requestId} estado=${req.status} (no 'submitted'); se omiten verificaciones`,
    );
    return;
  }

  const { data: responseRow } = await supabase
    .from("kyb_form_responses")
    .select("data")
    .eq("request_id", requestId)
    .maybeSingle();
  const data = (responseRow?.data as Record<string, unknown>) ?? {};

  // Dispara verificaciones: DIDIT real (por-feature) o mock.
  const amlProvider = env.amlProvider();
  console.log(
    `[AML] request=${requestId} provider=${amlProvider} form_id=${req.form_id ?? "null"}`,
  );
  try {
    if (amlProvider === "didit") {
      const definition = await resolveRequestDefinition(
        (req as { form_definition?: unknown }).form_definition,
        req.form_id,
      );
      if (!definition) {
        console.error(
          `[AML] request=${requestId} sin definición de formulario (form_id=${req.form_id ?? "null"}); no se puede verificar`,
        );
        throw new Error("No se encontró la definición del formulario para las verificaciones");
      }

      // Reanudable: no re-hacer verificaciones ya exitosas y limpiar errores
      // viejos para no acumular filas en cada reintento.
      const { data: existing } = await supabase
        .from("aml_checks")
        .select("feature, field_key, status")
        .eq("request_id", requestId)
        .eq("provider", "didit");
      const skip = new Set<string>();
      for (const c of existing ?? []) {
        if (c.status !== "error") skip.add(`${c.feature}:${c.field_key ?? ""}`);
      }
      await supabase
        .from("aml_checks")
        .delete()
        .eq("request_id", requestId)
        .eq("provider", "didit")
        .eq("status", "error");

      // Inserta cada verificación apenas completa (sobrevive a un corte del background).
      const insertRow = async (r: DiditCheckRow) => {
        const { error } = await supabase.from("aml_checks").insert({
          request_id: requestId,
          provider: "didit",
          feature: r.feature,
          field_key: r.fieldKey,
          external_ref: r.externalRef,
          status: r.status,
          score: r.score,
          result: r.result,
        });
        if (error) {
          console.error(
            `[AML] request=${requestId} insert check (${r.feature}/${r.fieldKey ?? "-"}) falló:`,
            error.message,
          );
        }
      };

      const rows = await dispatchDiditReviews({
        requestId,
        externalRef: req.external_ref,
        definition,
        answers: data,
        skip,
        onRow: insertRow,
      });
      console.log(
        `[AML] request=${requestId} DIDIT: ${rows.length} verificaciones nuevas (ya hechas=${skip.size})`,
      );
      if (!rows.length && skip.size === 0) {
        console.warn(
          `[AML] request=${requestId} DIDIT no produjo checks: el formulario no tiene campos con revisión DIDIT (field.review.provider="didit")`,
        );
      }
    } else {
      // Mock: idempotente — si ya hay un check no-error, no duplicar.
      const { data: existing } = await supabase
        .from("aml_checks")
        .select("id")
        .eq("request_id", requestId)
        .neq("status", "error")
        .limit(1);
      if ((existing ?? []).length > 0) {
        console.log(`[AML] request=${requestId} ya tiene checks; se omite mock`);
      } else {
        const provider = getAmlProvider();
        const result = await provider.submitCheck({
          requestId,
          externalRef: req.external_ref,
          subject: buildAmlSubject(data),
        });
        const { error } = await supabase.from("aml_checks").insert({
          request_id: requestId,
          provider: provider.name,
          external_ref: result.externalRef,
          status: result.status,
          result: result.result ?? null,
        });
        if (error) {
          console.error(`[AML] request=${requestId} insert (${provider.name}) falló:`, error.message);
        }
      }
    }
  } catch (e) {
    console.error(
      `[AML] request=${requestId} verificación falló:`,
      e instanceof Error ? e.message : String(e),
    );
    const { error: insErr } = await supabase.from("aml_checks").insert({
      request_id: requestId,
      provider: amlProvider,
      status: "error",
      result: { error: e instanceof Error ? e.message : String(e) },
    });
    if (insErr) {
      console.error(
        `[AML] request=${requestId} no se pudo guardar la fila de error:`,
        insErr.message,
      );
    }
  }

  await setStatus(requestId, "under_review", req.status, "system", "moved_to_review");

  // Push al cliente (si la solicitud tiene callback_url). Corre en el mismo
  // contexto background (`after`) que runVerifications; no bloquea al usuario.
  await notifyClient(requestId, "verification.completed");
}

/** Decisión del analista (approve/reject), con motivo legible opcional. */
export async function decideRequest(
  requestId: string,
  decision: KybDecision,
  analyst: { userId: string; email: string },
  reason?: string,
): Promise<void> {
  const supabase = createServiceClient();
  const { data: req } = await supabase
    .from("kyb_requests")
    .select("status")
    .eq("id", requestId)
    .single();
  if (!req) throw new Error("Solicitud no encontrada");
  if (isTerminal(req.status)) throw new Error("La solicitud ya está cerrada");

  const to: KybStatus = decision === "approved" ? "approved" : "rejected";
  const trimmedReason = reason?.trim() || null;
  await supabase
    .from("kyb_requests")
    .update({
      status: to,
      decision,
      decided_at: new Date().toISOString(),
      decided_by: analyst.userId,
      decision_reason: trimmedReason,
    })
    .eq("id", requestId);

  await logAudit({
    requestId,
    actor: analyst.email,
    action: "decision",
    fromStatus: req.status,
    toStatus: to,
    metadata: { decision, reason: trimmedReason },
  });
}

/**
 * Devuelve una solicitud ya enviada al solicitante para que corrija preguntas
 * puntuales: borra las respuestas marcadas del blob (dejándolas disponibles de
 * nuevo), guarda el set de correcciones + notas, re-emite el link y pasa a
 * `changes_requested`. Idempotente vía compare-and-set: solo actúa sobre
 * `submitted`/`under_review`. NO dispara el webhook (lo hace el llamador con
 * `after(...)`, como `decision.made`).
 */
export async function requestChanges(
  requestId: string,
  fields: { key: string; note?: string }[],
  opts: { actor: string; source: "admin" | "api"; ttlHours?: number },
): Promise<
  | { ok: true; invitationUrl: string; token: string; expiresAt: string; round: number }
  | { ok: false; error: string }
> {
  const supabase = createServiceClient();
  const { data: req } = await supabase
    .from("kyb_requests")
    .select("id, status, corrections, form_id, form_definition")
    .eq("id", requestId)
    .single();
  if (!req) return { ok: false, error: "Solicitud no encontrada" };

  const from = req.status as KybStatus;
  if (from !== "submitted" && from !== "under_review") {
    return {
      ok: false,
      error: "La solicitud no admite correcciones en su estado actual.",
    };
  }

  const definition = await resolveRequestDefinition(
    (req as { form_definition?: unknown }).form_definition,
    (req as { form_id?: string | null }).form_id,
  );
  if (!definition) {
    return {
      ok: false,
      error: "El formulario no soporta correcciones por-pregunta (legacy).",
    };
  }

  // Solo keys que existen en la definición; deduplicadas (primera nota gana).
  const validKeys = new Set(definition.sections.flatMap((s) => s.fields.map((f) => f.key)));
  const seen = new Set<string>();
  const marked: KybCorrectionField[] = [];
  for (const f of fields) {
    if (!validKeys.has(f.key) || seen.has(f.key)) continue;
    seen.add(f.key);
    marked.push({ key: f.key, note: f.note?.trim() ?? "" });
  }
  if (marked.length === 0) {
    return { ok: false, error: "No hay preguntas válidas para corregir." };
  }

  const prev = (req as { corrections?: KybCorrections | null }).corrections;
  const round = (prev?.round ?? 0) + 1;
  const corrections: KybCorrections = {
    round,
    requested_at: new Date().toISOString(),
    source: opts.source,
    requested_by: opts.actor,
    fields: marked,
  };

  // Compare-and-set atómico: gana un solo requestChanges/decideRequest
  // concurrente, y deja estado + correcciones consistentes de una vez.
  const { data: locked } = await supabase
    .from("kyb_requests")
    .update({ status: "changes_requested", corrections })
    .eq("id", requestId)
    .in("status", ["submitted", "under_review"])
    .select("id")
    .maybeSingle();
  if (!locked) {
    return {
      ok: false,
      error: "La solicitud cambió de estado; reintenta.",
    };
  }

  // Borra del blob las respuestas marcadas (y sus archivos, para re-subida limpia).
  const { data: responseRow } = await supabase
    .from("kyb_form_responses")
    .select("data")
    .eq("request_id", requestId)
    .maybeSingle();
  const answers = { ...((responseRow?.data as Record<string, unknown>) ?? {}) };
  for (const { key } of marked) {
    for (const ref of fileRefsOf(answers[key])) {
      await deleteDocument({ requestId, storagePath: ref.path });
    }
    delete answers[key];
  }
  await supabase
    .from("kyb_form_responses")
    .upsert(
      { request_id: requestId, data: answers, form_version: FORM_VERSION },
      { onConflict: "request_id" },
    );

  // Re-verificar solo lo corregido: borra los aml_checks de esas preguntas.
  await supabase
    .from("aml_checks")
    .delete()
    .eq("request_id", requestId)
    .in("field_key", marked.map((m) => m.key));

  await logAudit({
    requestId,
    actor: opts.actor,
    action: "changes_requested",
    fromStatus: from,
    toStatus: "changes_requested",
    metadata: { round, source: opts.source, fields: marked },
  });

  const { token, expiresAt, invitationUrl } = await issueToken(
    requestId,
    opts.ttlHours,
  );
  return { ok: true, invitationUrl, token, expiresAt, round };
}

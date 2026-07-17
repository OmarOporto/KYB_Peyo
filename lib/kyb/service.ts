import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken, hashToken } from "@/lib/tokens";
import { env } from "@/lib/env";
import { getAmlProvider } from "@/lib/aml";
import { buildAmlSubject } from "@/lib/aml/mapping";
import { dispatchDiditReviews } from "@/lib/didit/verify";
import { getFormForRequest } from "@/lib/forms/store";
import { FORM_VERSION } from "@/lib/forms/schema";
import type { KybDecision, KybRequest, KybStatus } from "@/lib/kyb/types";

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
      await setStatus(req.id, "expired", req.status, "system", "token_expired");
    }
    return { ...req, status: "expired" };
  }
  return req;
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
    .select("id, status")
    .eq("id", requestId)
    .single();
  if (!req) throw new Error("Solicitud no encontrada");
  if (isTerminal(req.status)) throw new Error("La solicitud ya está cerrada");

  await supabase
    .from("kyb_form_responses")
    .upsert(
      { request_id: requestId, data, form_version: FORM_VERSION },
      { onConflict: "request_id" },
    );

  await supabase
    .from("kyb_requests")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
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
export async function runVerifications(requestId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: req } = await supabase
    .from("kyb_requests")
    .select("id, status, external_ref, form_id")
    .eq("id", requestId)
    .single();
  if (!req) {
    console.error(`[AML] request=${requestId} no encontrada; se omiten verificaciones`);
    return;
  }
  // Idempotencia: solo verificar una solicitud recién enviada.
  if (req.status !== "submitted") {
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
      const form = await getFormForRequest(req.form_id);
      if (!form) {
        console.error(
          `[AML] request=${requestId} sin definición de formulario (form_id=${req.form_id ?? "null"}); no se puede verificar`,
        );
        throw new Error("No se encontró la definición del formulario para las verificaciones");
      }
      const rows = await dispatchDiditReviews({
        requestId,
        externalRef: req.external_ref,
        definition: form.definition,
        answers: data,
      });
      if (rows.length) {
        const { error } = await supabase.from("aml_checks").insert(
          rows.map((r) => ({
            request_id: requestId,
            provider: "didit",
            feature: r.feature,
            field_key: r.fieldKey,
            external_ref: r.externalRef,
            status: r.status,
            score: r.score,
            result: r.result,
          })),
        );
        if (error) {
          console.error(
            `[AML] request=${requestId} insert de ${rows.length} checks DIDIT falló:`,
            error.message,
          );
          // Respaldo visible en el panel: no referencia columnas nuevas
          // (feature/field_key/score), así entra aun si falta la migración.
          await supabase.from("aml_checks").insert({
            request_id: requestId,
            provider: "didit",
            status: "error",
            result: { error: error.message, checks: rows.length },
          });
        } else {
          console.log(`[AML] request=${requestId} guardados ${rows.length} checks DIDIT`);
        }
      } else {
        console.warn(
          `[AML] request=${requestId} DIDIT no produjo checks: el formulario (form_id=${req.form_id ?? "null"}) no tiene campos con revisión DIDIT (field.review.provider="didit")`,
        );
      }
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

  await setStatus(requestId, "under_review", "submitted", "system", "moved_to_review");
}

/** Decisión del analista (approve/reject). */
export async function decideRequest(
  requestId: string,
  decision: KybDecision,
  analyst: { userId: string; email: string },
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
  await supabase
    .from("kyb_requests")
    .update({
      status: to,
      decision,
      decided_at: new Date().toISOString(),
      decided_by: analyst.userId,
    })
    .eq("id", requestId);

  await logAudit({
    requestId,
    actor: analyst.email,
    action: "decision",
    fromStatus: req.status,
    toStatus: to,
    metadata: { decision },
  });
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken, hashToken } from "@/lib/tokens";
import { env } from "@/lib/env";
import { getAmlProvider } from "@/lib/aml";
import { buildAmlSubject } from "@/lib/aml/mapping";
import { dispatchDiditReviews, type DiditCheckRow } from "@/lib/didit/verify";
import { notifyClient } from "@/lib/kyb/webhook";
import { resolveRequestDefinition } from "@/lib/forms/store";
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
 * Re-emite el link de invitación de una solicitud existente (conserva el
 * borrador). Útil si el cliente perdió el link o expiró. Rechaza solicitudes ya
 * enviadas o cerradas.
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
  if (!["created", "in_progress", "expired"].includes(status)) {
    return {
      ok: false,
      error: "La solicitud ya fue enviada o cerrada; no admite re-emitir el link.",
    };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  await supabase
    .from("kyb_requests")
    .update({ invitation_token_hash: hashToken(token), token_expires_at: expiresAt })
    .eq("id", requestId);

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

  return {
    ok: true,
    invitationUrl: `${env.appUrl()}/f/${token}`,
    token,
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

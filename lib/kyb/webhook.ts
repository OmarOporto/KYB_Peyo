import "server-only";
import { createHmac } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import { open } from "@/lib/crypto/secretBox";
import { safeWebhookFetch } from "@/lib/net/ssrfGuard";

export type WebhookEvent =
  | "request.submitted"
  | "verification.completed"
  | "decision.made"
  | "changes.requested"
  | "request.expiring"
  | "request.expired";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Webhook saliente hacia el endpoint REGISTRADO del cliente. Solo dispara si la
 * solicitud referencia un `webhook_endpoint_id` habilitado. Firma con el secreto
 * propio del endpoint: `x-kyb-signature: v1=HMAC(secret, timestamp + "." + body)`
 * (+ `x-kyb-timestamp` para anti-replay). Fetch anti-SSRF (destino re-validado).
 * Nunca lanza.
 */
export async function notifyClient(
  requestId: string,
  event: WebhookEvent,
): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: req } = await supabase
      .from("kyb_requests")
      .select(
        "id, external_ref, status, decision, decision_reason, corrections, webhook_endpoint_id, created_at, submitted_at, decided_at, token_expires_at",
      )
      .eq("id", requestId)
      .maybeSingle();
    if (!req?.webhook_endpoint_id) return; // sin endpoint registrado → no-op

    const { data: ep } = await supabase
      .from("webhook_endpoints")
      .select("url, secret_encrypted, enabled")
      .eq("id", req.webhook_endpoint_id)
      .maybeSingle();
    if (!ep || !ep.enabled) {
      console.warn(`[webhook] request=${requestId} endpoint ausente/deshabilitado; se omite`);
      return;
    }

    let secret: string;
    try {
      secret = open(ep.secret_encrypted as string);
    } catch (e) {
      console.error(`[webhook] request=${requestId} no se pudo descifrar el secreto:`, e);
      return;
    }

    const { data: aml } = await supabase
      .from("aml_checks")
      .select("provider, status, result, created_at, updated_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });

    const eventId = `evt_${generateToken(12)}`;
    const deliveryId = `dlv_${generateToken(12)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const body = JSON.stringify({
      event,
      event_id: eventId,
      sent_at: new Date().toISOString(),
      id: req.id,
      external_ref: req.external_ref,
      status: req.status,
      decision: req.decision,
      reason: req.decision_reason ?? null,
      corrections: req.corrections ?? null,
      expires_at: req.token_expires_at ?? null,
      created_at: req.created_at,
      submitted_at: req.submitted_at,
      decided_at: req.decided_at,
      aml: aml ?? [],
    });
    // Firma sobre "timestamp.body" para impedir replay de un body válido.
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-kyb-event": event,
      "x-kyb-event-id": eventId,
      "x-kyb-delivery-id": deliveryId,
      "x-kyb-timestamp": timestamp,
      "x-kyb-signature": `v1=${signature}`,
    };
    const url = ep.url as string;

    let lastError = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await safeWebhookFetch(url, { body, headers, timeoutMs: 5000 });
        if (res.ok) {
          await audit(requestId, "webhook_delivered", {
            event,
            eventId,
            deliveryId,
            status: res.status,
            attempt,
          });
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
      if (attempt < 3) await sleep(attempt * 500);
    }
    console.error(
      `[webhook] request=${requestId} event=${event} falló tras 3 intentos: ${lastError}`,
    );
    await audit(requestId, "webhook_failed", { event, eventId, deliveryId, error: lastError });
  } catch (e) {
    console.error(`[webhook] request=${requestId} error inesperado:`, e);
  }
}

async function audit(requestId: string, action: string, metadata: Record<string, unknown>) {
  const supabase = createServiceClient();
  await supabase
    .from("audit_log")
    .insert({ request_id: requestId, actor: "system", action, metadata });
}

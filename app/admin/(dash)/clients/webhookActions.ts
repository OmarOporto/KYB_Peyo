"use server";

import { revalidatePath } from "next/cache";
import { requireAnalyst } from "@/lib/auth/admin";
import { loadOwnedApiKey, loadOwnedDelivery, loadOwnedEndpoint } from "@/lib/auth/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import { seal } from "@/lib/crypto/secretBox";
import { assertPublicHttpsUrl } from "@/lib/net/ssrfGuard";
import { resendDelivery } from "@/lib/kyb/webhook";
import { logAudit } from "@/lib/kyb/service";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Los endpoints pertenecen a la org de su API key. Cada acción verifica que la
 * key sea de la org del analista y, cuando recibe también el id del endpoint o
 * de la entrega, que cuelgue de ESA key: antes el `apiKeyId` solo se usaba
 * para revalidar la página y el update iba por el id suelto.
 */

const NOT_FOUND = { ok: false as const, error: "Endpoint no encontrado." };

function newSecret(): string {
  return `whsec_${generateToken(24)}`;
}

/** Registra un endpoint de webhook validando el destino (anti-SSRF). */
export async function createWebhookEndpointAction(
  apiKeyId: string,
  url: string,
): Promise<Result<{ secret: string }>> {
  const analyst = await requireAnalyst();
  // Sin este chequeo, cualquiera registraba su URL en la key de otro cliente y
  // recibía sus `decision.made` con datos del solicitante.
  const key = await loadOwnedApiKey(analyst, apiKeyId);
  if (!key) return { ok: false, error: "Cliente no encontrado." };
  try {
    await assertPublicHttpsUrl(url.trim());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "URL inválida" };
  }
  const secret = newSecret();
  let secretEncrypted: string;
  try {
    secretEncrypted = seal(secret);
  } catch {
    return { ok: false, error: "Falta configurar KYB_SECRET_ENC_KEY en el servidor." };
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("webhook_endpoints").insert({
    api_key_id: apiKeyId,
    url: url.trim(),
    secret_encrypted: secretEncrypted,
    secret_last4: secret.slice(-4),
  });
  if (error) return { ok: false, error: error.message };

  await logAudit({
    requestId: null,
    orgId: key.org_id as string,
    actor: analyst.email,
    actorUserId: analyst.userId,
    action: "webhook_endpoint_created",
    metadata: { apiKeyId, url: url.trim() },
  });
  revalidatePath(`/admin/clients/${apiKeyId}/webhooks`);
  return { ok: true, secret };
}

/** Rota el secreto de firma (se muestra en claro una sola vez). */
export async function rotateWebhookSecretAction(
  id: string,
  apiKeyId: string,
): Promise<Result<{ secret: string }>> {
  const analyst = await requireAnalyst();
  const endpoint = await loadOwnedEndpoint(analyst, id, apiKeyId);
  if (!endpoint) return NOT_FOUND;

  const secret = newSecret();
  let secretEncrypted: string;
  try {
    secretEncrypted = seal(secret);
  } catch {
    return { ok: false, error: "Falta configurar KYB_SECRET_ENC_KEY en el servidor." };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("webhook_endpoints")
    .update({
      secret_encrypted: secretEncrypted,
      secret_last4: secret.slice(-4),
      rotated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    requestId: null,
    orgId: endpoint.org_id,
    actor: analyst.email,
    actorUserId: analyst.userId,
    action: "webhook_secret_rotated",
    metadata: { endpointId: id, apiKeyId },
  });
  revalidatePath(`/admin/clients/${apiKeyId}/webhooks`);
  return { ok: true, secret };
}

/** Habilita o deshabilita un endpoint (sin borrarlo). */
export async function setWebhookEnabledAction(
  id: string,
  apiKeyId: string,
  enabled: boolean,
): Promise<Result> {
  const analyst = await requireAnalyst();
  const endpoint = await loadOwnedEndpoint(analyst, id, apiKeyId);
  if (!endpoint) return NOT_FOUND;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("webhook_endpoints")
    .update({ enabled })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/clients/${apiKeyId}/webhooks`);
  return { ok: true };
}

/**
 * Reencola una entrega fallida. No entrega en el acto: la deja `pending` y el
 * cron la toma en la próxima corrida (dentro del minuto). El `event_id` no
 * cambia, así que el receptor la sigue deduplicando contra intentos previos.
 */
export async function resendWebhookDeliveryAction(
  deliveryId: string,
  apiKeyId: string,
): Promise<Result> {
  const analyst = await requireAnalyst();
  const delivery = await loadOwnedDelivery(analyst, deliveryId, apiKeyId);
  if (!delivery) return { ok: false, error: "Entrega no encontrada." };

  const ok = await resendDelivery(deliveryId);
  if (!ok) return { ok: false, error: "No se pudo reencolar la entrega." };
  await logAudit({
    requestId: null,
    orgId: delivery.org_id,
    actor: analyst.email,
    actorUserId: analyst.userId,
    action: "webhook_delivery_resent",
    metadata: { deliveryId, apiKeyId },
  });
  revalidatePath(`/admin/clients/${apiKeyId}/webhooks`);
  return { ok: true };
}

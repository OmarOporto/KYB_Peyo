"use server";

import { revalidatePath } from "next/cache";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken } from "@/lib/tokens";
import { seal } from "@/lib/crypto/secretBox";
import { assertPublicHttpsUrl } from "@/lib/net/ssrfGuard";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function newSecret(): string {
  return `whsec_${generateToken(24)}`;
}

/** Registra un endpoint de webhook validando el destino (anti-SSRF). */
export async function createWebhookEndpointAction(
  apiKeyId: string,
  url: string,
): Promise<Result<{ secret: string }>> {
  await requireAnalyst();
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
  revalidatePath(`/admin/clients/${apiKeyId}/webhooks`);
  return { ok: true, secret };
}

/** Rota el secreto de firma (se muestra en claro una sola vez). */
export async function rotateWebhookSecretAction(
  id: string,
  apiKeyId: string,
): Promise<Result<{ secret: string }>> {
  await requireAnalyst();
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
  revalidatePath(`/admin/clients/${apiKeyId}/webhooks`);
  return { ok: true, secret };
}

/** Habilita o deshabilita un endpoint (sin borrarlo). */
export async function setWebhookEnabledAction(
  id: string,
  apiKeyId: string,
  enabled: boolean,
): Promise<Result> {
  await requireAnalyst();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("webhook_endpoints")
    .update({ enabled })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/clients/${apiKeyId}/webhooks`);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken, hashToken } from "@/lib/tokens";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Genera una API key nueva con prefijo reconocible. */
function newApiKey(): string {
  return `kyb_${generateToken(24)}`;
}

/** Emite una API key nueva. Devuelve el texto plano UNA sola vez. */
export async function createApiKeyAction(
  label: string,
  rateLimitPerMin?: number | null,
): Promise<Result<{ apiKey: string }>> {
  await requireAnalyst();
  const clean = label.trim();
  if (!clean) return { ok: false, error: "El nombre del cliente es requerido." };

  const supabase = createServiceClient();
  const apiKey = newApiKey();
  const { error } = await supabase.from("api_keys").insert({
    key_hash: hashToken(apiKey),
    key_prefix: apiKey.slice(0, 12),
    label: clean,
    rate_limit_per_min: rateLimitPerMin ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clients");
  return { ok: true, apiKey };
}

/** Revoca una API key (queda inservible; las solicitudes creadas se conservan). */
export async function revokeApiKeyAction(id: string): Promise<Result> {
  await requireAnalyst();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/clients");
  return { ok: true };
}

/**
 * Rota la key EN EL MISMO registro (la anterior deja de funcionar al instante).
 * Se mantiene la misma identidad de cliente: webhooks, formulario asignado, límite
 * y contadores siguen ligados a esta fila.
 */
export async function rotateApiKeyAction(
  id: string,
): Promise<Result<{ apiKey: string }>> {
  await requireAnalyst();
  const apiKey = newApiKey();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({
      key_hash: hashToken(apiKey),
      key_prefix: apiKey.slice(0, 12),
      revoked_at: null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}/webhooks`);
  return { ok: true, apiKey };
}

/** Asigna (o limpia con null) el formulario por defecto del cliente. */
export async function setDefaultFormAction(
  id: string,
  formId: string | null,
): Promise<Result> {
  await requireAnalyst();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ default_form_id: formId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/clients/${id}/webhooks`);
  return { ok: true };
}

/** Fija (o limpia con null) el rate limit por-key. */
export async function setRateLimitAction(
  id: string,
  rateLimitPerMin: number | null,
): Promise<Result> {
  await requireAnalyst();
  if (rateLimitPerMin != null && (!Number.isInteger(rateLimitPerMin) || rateLimitPerMin <= 0)) {
    return { ok: false, error: "El límite debe ser un entero positivo." };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ rate_limit_per_min: rateLimitPerMin })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/clients");
  return { ok: true };
}

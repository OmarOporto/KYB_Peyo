"use server";

import { revalidatePath } from "next/cache";
import { requireAnalyst } from "@/lib/auth/admin";
import { creationOrg, loadOwnedApiKey, loadOwnedForm } from "@/lib/auth/tenant";
import { logAudit } from "@/lib/kyb/service";
import { createServiceClient } from "@/lib/supabase/service";
import { generateToken, hashToken } from "@/lib/tokens";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Cada cliente administra sus propias API keys. Todas las acciones reciben el
 * id de la key desde el navegador y operan con service-role, así que verifican
 * antes que sea de la org del analista (el admin puede operar sobre todas).
 */

const NOT_FOUND = { ok: false as const, error: "Cliente no encontrado." };

/** Genera una API key nueva con prefijo reconocible. */
function newApiKey(): string {
  return `kyb_${generateToken(24)}`;
}

/**
 * Emite una API key nueva. Devuelve el texto plano UNA sola vez.
 *
 * `orgId` solo lo usa el admin (para dar de alta la key de un cliente); un
 * miembro la crea siempre en su org. El rate limit inicial también es del
 * admin: protege a la plataforma, no al cliente.
 */
export async function createApiKeyAction(
  label: string,
  rateLimitPerMin?: number | null,
  orgId?: string | null,
): Promise<Result<{ apiKey: string }>> {
  const analyst = await requireAnalyst();
  const clean = label.trim();
  if (!clean) return { ok: false, error: "El nombre del cliente es requerido." };

  const org = await creationOrg(analyst, orgId);
  if (!org) return { ok: false, error: "Organización inválida." };

  const supabase = createServiceClient();
  const apiKey = newApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id: org,
      key_hash: hashToken(apiKey),
      key_prefix: apiKey.slice(0, 12),
      label: clean,
      rate_limit_per_min: analyst.role === "admin" ? (rateLimitPerMin ?? null) : null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logAudit({
    requestId: null,
    orgId: org,
    actor: analyst.email,
    actorUserId: analyst.userId,
    action: "api_key_created",
    metadata: { keyId: data.id, label: clean },
  });
  revalidatePath("/admin/clients");
  return { ok: true, apiKey };
}

/** Revoca una API key (queda inservible; las solicitudes creadas se conservan). */
export async function revokeApiKeyAction(id: string): Promise<Result> {
  const analyst = await requireAnalyst();
  const key = await loadOwnedApiKey(analyst, id);
  if (!key) return NOT_FOUND;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    requestId: null,
    orgId: key.org_id as string,
    actor: analyst.email,
    actorUserId: analyst.userId,
    action: "api_key_revoked",
    metadata: { keyId: id },
  });
  revalidatePath("/admin/clients");
  return { ok: true };
}

/**
 * Rota la key EN EL MISMO registro (la anterior deja de funcionar al instante).
 * Se mantiene la misma identidad de cliente: webhooks, formulario asignado, límite
 * y contadores siguen ligados a esta fila.
 *
 * Devuelve la key nueva en claro: sin el chequeo de org, cualquier analista se
 * quedaba con acceso total a la API de otro cliente.
 */
export async function rotateApiKeyAction(
  id: string,
): Promise<Result<{ apiKey: string }>> {
  const analyst = await requireAnalyst();
  const key = await loadOwnedApiKey(analyst, id);
  if (!key) return NOT_FOUND;

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

  await logAudit({
    requestId: null,
    orgId: key.org_id as string,
    actor: analyst.email,
    actorUserId: analyst.userId,
    action: "api_key_rotated",
    metadata: { keyId: id },
  });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}/webhooks`);
  return { ok: true, apiKey };
}

/**
 * Asigna (o limpia con null) el formulario por defecto del cliente. Tiene que
 * ser un formulario PUBLICADO de la misma org que la key: es el que la API usa
 * cuando la solicitud llega sin `form_id` (lib/forms/formChoice.ts).
 */
export async function setDefaultFormAction(
  id: string,
  formId: string | null,
): Promise<Result> {
  const analyst = await requireAnalyst();
  const key = await loadOwnedApiKey(analyst, id);
  if (!key) return NOT_FOUND;

  if (formId) {
    const form = await loadOwnedForm(analyst, formId, "id, status");
    if (!form || form.org_id !== key.org_id || form.status !== "published") {
      return { ok: false, error: "El formulario no está publicado o no es de este cliente." };
    }
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ default_form_id: formId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/clients/${id}/webhooks`);
  return { ok: true };
}

/**
 * Habilita/deshabilita la traducción con IA de las respuestas de este cliente.
 * Arranca apagado: traducir respuestas manda datos del solicitante (PII) a un
 * proveedor externo, así que requiere una decisión explícita por cliente.
 */
export async function setAiTranslationAction(
  id: string,
  allow: boolean,
): Promise<Result> {
  const analyst = await requireAnalyst();
  const key = await loadOwnedApiKey(analyst, id);
  if (!key) return NOT_FOUND;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ allow_ai_translation: allow })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAudit({
    requestId: null,
    orgId: key.org_id as string,
    actor: analyst.email,
    actorUserId: analyst.userId,
    action: "api_key_ai_translation",
    metadata: { keyId: id, allow },
  });
  revalidatePath("/admin/clients");
  return { ok: true };
}

/**
 * Fija (o limpia con null) el rate limit por-key. Solo admin: el límite
 * protege a la plataforma, y un cliente podría subirse el propio.
 */
export async function setRateLimitAction(
  id: string,
  rateLimitPerMin: number | null,
): Promise<Result> {
  const analyst = await requireAnalyst();
  if (analyst.role !== "admin") {
    return { ok: false, error: "Solo un administrador puede cambiar el límite." };
  }
  if (rateLimitPerMin != null && (!Number.isInteger(rateLimitPerMin) || rateLimitPerMin <= 0)) {
    return { ok: false, error: "El límite debe ser un entero positivo." };
  }
  const key = await loadOwnedApiKey(analyst, id);
  if (!key) return NOT_FOUND;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ rate_limit_per_min: rateLimitPerMin })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/clients");
  return { ok: true };
}

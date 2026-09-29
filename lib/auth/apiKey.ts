import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { hashToken } from "@/lib/tokens";

/** API key válida: su id, la org dueña y su formulario por defecto. */
export interface ApiKeyIdentity {
  keyId: string;
  orgId: string;
  /** `KYB_FORM_ID` configurado en el panel (Clientes API), si hay. */
  defaultFormId: string | null;
  /**
   * La org dueña está suspendida (0028_accounts.sql). La key sigue siendo
   * válida, pero apiGuard responde 403: el cliente sabe que no es un problema
   * de credenciales.
   */
  orgSuspended: boolean;
}

/**
 * Verifica el header Authorization: Bearer <api_key> contra api_keys.
 * Devuelve la identidad de la key si es válida y no está revocada; null si no.
 */
export async function verifyApiKey(
  authHeader: string | null,
): Promise<ApiKeyIdentity | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const keyHash = hashToken(match[1].trim());
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, org_id, default_form_id, revoked_at, org:organizations!inner(disabled_at)")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;
  const org = data.org as { disabled_at: string | null } | { disabled_at: string | null }[];
  const orgDisabledAt = Array.isArray(org) ? org[0]?.disabled_at : org?.disabled_at;
  return {
    keyId: data.id as string,
    orgId: data.org_id as string,
    defaultFormId: (data.default_form_id as string | null) ?? null,
    orgSuspended: Boolean(orgDisabledAt),
  };
}

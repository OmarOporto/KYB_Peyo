import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { hashToken } from "@/lib/tokens";

/**
 * Verifica el header Authorization: Bearer <api_key> contra api_keys.
 * Devuelve el id de la key si es válida y no está revocada; null si no.
 */
export async function verifyApiKey(
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const keyHash = hashToken(match[1].trim());
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;
  return data.id as string;
}

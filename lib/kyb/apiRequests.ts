import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Lee una solicitud SOLO si pertenece a la API key dada (aislamiento por
 * cliente). Devuelve null si no existe o no es suya.
 */
export async function getOwnedRequest(
  keyId: string,
  id: string,
  columns: string,
): Promise<Record<string, unknown> | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("kyb_requests")
    .select(columns)
    .eq("id", id)
    .eq("api_key_id", keyId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

import "server-only";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type Claim =
  | { status: "proceed" }
  | { status: "replay"; httpStatus: number; body: unknown }
  | { status: "conflict"; error: string };

export function hashBody(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Reclama una Idempotency-Key para un cliente. Inserta la fila (claim) de forma
 * atómica; si ya existe, decide si reproducir la respuesta original, o si es un
 * conflicto (mismo key con body distinto, o una petición aún en curso).
 */
export async function claimIdempotency(
  apiKeyId: string,
  key: string,
  requestHash: string,
): Promise<Claim> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("idempotency_keys")
    .insert({ api_key_id: apiKeyId, key, request_hash: requestHash });

  if (!error) return { status: "proceed" }; // ganamos el claim

  // Conflicto de PK: ya existe. Ver el estado de la anterior.
  const { data: existing } = await supabase
    .from("idempotency_keys")
    .select("request_hash, response_status, response_body")
    .eq("api_key_id", apiKeyId)
    .eq("key", key)
    .maybeSingle();

  if (!existing) return { status: "conflict", error: "idempotency_conflict" };
  if (existing.request_hash !== requestHash) {
    return { status: "conflict", error: "idempotency_key_reuse" }; // mismo key, body distinto
  }
  if (existing.response_status == null) {
    return { status: "conflict", error: "request_in_progress" }; // en curso; reintentar
  }
  return {
    status: "replay",
    httpStatus: existing.response_status as number,
    body: existing.response_body,
  };
}

/** Guarda la respuesta para futuros replays de la misma Idempotency-Key. */
export async function storeIdempotentResponse(
  apiKeyId: string,
  key: string,
  httpStatus: number,
  body: unknown,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("idempotency_keys")
    .update({ response_status: httpStatus, response_body: body })
    .eq("api_key_id", apiKeyId)
    .eq("key", key);
}

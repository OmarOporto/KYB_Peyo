import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";

export type RateResult = { allowed: boolean; limit: number; remaining: number };

/**
 * Consume una llamada de la API key: registra el uso (last_used_at + contador
 * diario) y aplica el rate limit por-key (o el default global) vía la función
 * atómica `consume_api_key`. Fail-open: si el contador falla, no bloquea (loguea).
 */
export async function consumeApiKey(
  keyId: string,
  opts?: { failClosed?: boolean },
): Promise<RateResult> {
  const fallback = env.apiRateLimitDefault();
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("consume_api_key", {
    p_key_id: keyId,
    p_default: fallback,
  });
  if (error) {
    console.error("[rateLimit] consume_api_key falló:", error.message);
    // Endpoints sensibles/costosos: fail-closed (denegar). Lecturas baratas: fail-open.
    return { allowed: !opts?.failClosed, limit: fallback, remaining: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    limit: Number(row?.limit_per_min ?? fallback),
    remaining: Number(row?.remaining ?? 0),
  };
}

/**
 * Rate limit por clave de texto libre, para lo que no tiene API key: hoy, el
 * intake público (`intake:<formId>:<ip>`).
 *
 * Fail-CLOSED a diferencia de `consumeApiKey`: lo que protege es una escritura
 * en la base, y si el contador no se puede llevar, tampoco conviene escribir.
 */
export async function consumeRate(
  bucket: string,
  limit: number,
): Promise<RateResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("consume_rate", {
    p_bucket: bucket,
    p_limit: limit,
  });
  if (error) {
    console.error("[rateLimit] consume_rate falló:", error.message);
    return { allowed: false, limit, remaining: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    limit: Number(row?.limit_per_min ?? limit),
    remaining: Number(row?.remaining ?? 0),
  };
}

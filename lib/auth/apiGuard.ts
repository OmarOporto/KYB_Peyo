import "server-only";
import { NextResponse } from "next/server";
import { verifyApiKey, type ApiKeyIdentity } from "./apiKey";
import { consumeApiKey } from "./rateLimit";
import { rateLimitResponse } from "./rateLimitResponse";

/**
 * Guard estándar de la API v1: valida la API key (401) y aplica el rate limit
 * (429). Devuelve la identidad de la key (`keyId`, `orgId`, `defaultFormId`)
 * en éxito, o `{ response }` con la respuesta a retornar directo.
 */
export async function apiGuard(
  authHeader: string | null,
  opts?: { failClosed?: boolean },
): Promise<ApiKeyIdentity | { response: NextResponse }> {
  const key = await verifyApiKey(authHeader);
  if (!key) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const rl = await consumeApiKey(key.keyId, opts);
  if (!rl.allowed) return { response: rateLimitResponse(rl) };
  return key;
}

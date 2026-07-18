import "server-only";
import { NextResponse } from "next/server";
import { verifyApiKey } from "./apiKey";
import { consumeApiKey } from "./rateLimit";
import { rateLimitResponse } from "./rateLimitResponse";

/**
 * Guard estándar de la API v1: valida la API key (401) y aplica el rate limit
 * (429). Devuelve `{ keyId }` en éxito, o `{ response }` con la respuesta a
 * retornar directo.
 */
export async function apiGuard(
  authHeader: string | null,
  opts?: { failClosed?: boolean },
): Promise<{ keyId: string } | { response: NextResponse }> {
  const keyId = await verifyApiKey(authHeader);
  if (!keyId) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const rl = await consumeApiKey(keyId, opts);
  if (!rl.allowed) return { response: rateLimitResponse(rl) };
  return { keyId };
}

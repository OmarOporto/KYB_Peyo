import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** Genera un token opaco (para invitación o API key). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hash SHA-256 en hex; guardamos solo el hash, nunca el token en claro. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación en tiempo constante de dos hashes hex. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Comparación en tiempo constante de dos secretos cualesquiera (no hex): el
 * CRON_SECRET, el token del callback de kyb-search. Se comparan sus hashes, así
 * que el largo de las entradas tampoco filtra nada por tiempo.
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  return safeEqualHex(hashToken(a), hashToken(b));
}

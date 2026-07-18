/**
 * Enmascara claves sensibles antes de loguear. Úsalo siempre que vayas a loguear
 * un objeto que pueda contener credenciales, tokens, secretos o URLs firmadas.
 * NO loguees bodies completos ni PII de KYB (respuestas, documentos).
 */
const SENSITIVE =
  /^(authorization|cookie|set-cookie|token|api[-_]?key|secret|secret_encrypted|password|invitation_token|invitation_token_hash|key_hash|signed_url|x-kyb-signature)$/i;

export function redact<T>(value: T): T {
  return _redact(value, new WeakSet()) as T;
}

function _redact(v: unknown, seen: WeakSet<object>): unknown {
  if (v === null || typeof v !== "object") return v;
  if (seen.has(v as object)) return "[circular]";
  seen.add(v as object);
  if (Array.isArray(v)) return v.map((x) => _redact(x, seen));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = SENSITIVE.test(k) ? "[redacted]" : _redact(val, seen);
  }
  return out;
}

/**
 * Traduce un error de Supabase Auth a una clave de i18n (namespace "auth").
 *
 * Se decide por `error.code`, nunca por `message`: el mensaje es texto en
 * inglés que Supabase puede cambiar, y mostrarlo tal cual era lo que hacía el
 * login ("Invalid login credentials" en un panel en español).
 *
 * Puro (sin `@/`) para probarlo con `node --test`.
 */

const BY_CODE: Record<string, string> = {
  invalid_credentials: "errInvalidCredentials",
  captcha_failed: "errCaptcha",
  over_request_rate_limit: "errRateLimit",
  over_email_send_rate_limit: "errEmailRateLimit",
  user_banned: "errBanned",
  weak_password: "errWeakPassword",
  same_password: "errSamePassword",
  insufficient_aal: "errNeedsMfa",
  mfa_verification_failed: "errMfaCode",
  mfa_challenge_expired: "errMfaExpired",
  otp_expired: "errLinkExpired",
  otp_disabled: "errLinkExpired",
  session_not_found: "errSessionExpired",
  email_exists: "errEmailTaken",
  email_address_invalid: "errEmailInvalid",
};

export function authErrorKey(error: { code?: string | null; status?: number } | null | undefined): string {
  if (!error) return "errGeneric";
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  // Sin código (red caída, 5xx): genérico, sin exponer el detalle técnico.
  if (error.status === 429) return "errRateLimit";
  return "errGeneric";
}

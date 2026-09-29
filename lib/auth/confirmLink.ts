/**
 * Links de los correos de Auth: `/admin/login/confirm?token_hash=…&type=…`
 * (ver supabase/templates/).
 *
 * Solo se aceptan los tres tipos que mandan nuestras plantillas, y el destino
 * después de verificar lo decide el TIPO, no un parámetro `next` de la URL: no
 * hay redirección abierta posible.
 *
 * Puro (sin `@/`) para probarlo con `node --test`.
 */

export const CONFIRM_TYPES = ["recovery", "invite", "email_change"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

export function parseConfirmLink(params: {
  token_hash?: string | string[] | null;
  type?: string | string[] | null;
}): { tokenHash: string; type: ConfirmType } | null {
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash.trim() : "";
  const type = typeof params.type === "string" ? params.type : "";
  // Los hashes de GoTrue son hex; se acota para no pasar basura a verifyOtp.
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(tokenHash)) return null;
  if (!(CONFIRM_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as ConfirmType };
}

/** A dónde ir después de verificar el link. */
export function confirmDestination(type: ConfirmType): string {
  switch (type) {
    case "recovery":
      return "/admin/login/reset";
    case "invite":
      return "/admin/login/reset?invite=1";
    case "email_change":
      return "/admin/security?email=changed";
  }
}

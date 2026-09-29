/**
 * ¿La sesión ya cumplió con el 2FA?
 *
 * El 2FA es opcional, pero quien lo activó tiene que usarlo siempre: con al
 * menos un factor verificado, una sesión de solo contraseña (aal1) queda
 * "pendiente" hasta pasar el código (aal2). Lo mismo exige la RLS con
 * `mfa_ok()` (0026_security.sql).
 *
 * Los factores tienen que venir de `getUser()` (respuesta del servidor de
 * Auth), NO de la sesión guardada en la cookie: esa la escribe el navegador.
 *
 * Puro (sin `@/`) para probarlo con `node --test`.
 */
export type MfaGate = "ok" | "pending";

export function mfaGate(input: {
  currentLevel: string | null | undefined;
  verifiedFactors: number;
}): MfaGate {
  if (input.verifiedFactors === 0) return "ok";
  return input.currentLevel === "aal2" ? "ok" : "pending";
}

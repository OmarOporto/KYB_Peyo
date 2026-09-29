/**
 * Política de contraseñas del panel. Tiene que coincidir con la de Supabase
 * Auth (`minimum_password_length` / `password_requirements` en
 * supabase/config.toml y en el dashboard de producción): Supabase es quien la
 * hace cumplir; esto es para avisar ANTES de mandar, con un mensaje claro.
 *
 * Puro (sin `@/`) para probarlo con `node --test`.
 */

export const MIN_PASSWORD_LENGTH = 10;

export type PasswordRule = "length" | "letter" | "digit";

/** Reglas que la contraseña NO cumple (vacío = válida). */
export function passwordIssues(password: string): PasswordRule[] {
  const issues: PasswordRule[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) issues.push("length");
  if (!/\p{L}/u.test(password)) issues.push("letter");
  if (!/\d/.test(password)) issues.push("digit");
  return issues;
}

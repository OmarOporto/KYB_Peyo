/**
 * Reglas de cuentas: portales de login, estado de una cuenta y qué puede hacer
 * un admin sobre otra cuenta.
 *
 * Solo deciden; no leen la base. La garantía de fondo de "nunca cero admins
 * activos" y "no suspender una org con admins" la dan los triggers de
 * 0028_accounts.sql (con lock, a prueba de carreras); acá se pre-chequea para
 * dar un mensaje claro antes de intentar.
 *
 * Sin `import "server-only"` ni alias `@/` a propósito, como tenantRules.ts:
 * así se prueban con `node --test`.
 */

export type Role = "analyst" | "admin";

// ---------------------------------------------------------------------------
// Portales de login
// ---------------------------------------------------------------------------

/** Cada rol entra por su propio login: usuarios por /login, admin por /admin/login. */
export type Portal = "admin" | "user";

export function portalFor(role: Role): Portal {
  return role === "admin" ? "admin" : "user";
}

export function loginPath(portal: Portal): "/admin/login" | "/login" {
  return portal === "admin" ? "/admin/login" : "/login";
}

/** Cualquier cosa que no sea exactamente "admin" es el portal de usuarios. */
export function parsePortal(value: unknown): Portal {
  return value === "admin" ? "admin" : "user";
}

// ---------------------------------------------------------------------------
// Estado de la cuenta en sesión
// ---------------------------------------------------------------------------

export type AccountState =
  | { kind: "signed_out" }
  /** Autenticado pero sin fila en `analysts`. */
  | { kind: "no_account" }
  | { kind: "mfa_pending"; role: Role }
  | { kind: "suspended"; scope: "user" | "org"; role: Role }
  | { kind: "active"; role: Role };

/**
 * El orden importa: el 2FA va ANTES que la suspensión, así quien solo tiene la
 * contraseña no se entera de si la cuenta está suspendida ni ve el email de
 * contacto.
 */
export function accountState(input: {
  signedIn: boolean;
  /** La fila propia de `analysts` (null si no existe). */
  row: { role: Role; disabled: boolean } | null;
  mfaPending: boolean;
  /** La org se pudo leer y está habilitada. Solo se evalúa si el resto pasó. */
  orgUsable: boolean;
}): AccountState {
  if (!input.signedIn) return { kind: "signed_out" };
  if (!input.row) return { kind: "no_account" };
  const role = input.row.role;
  if (input.mfaPending) return { kind: "mfa_pending", role };
  if (input.row.disabled) return { kind: "suspended", scope: "user", role };
  if (!input.orgUsable) return { kind: "suspended", scope: "org", role };
  return { kind: "active", role };
}

/**
 * Qué hacer después de un inicio de sesión exitoso en un portal. El portal
 * equivocado se rechaza antes que el 2FA: no tiene sentido pedir el código a
 * quien igual no va a entrar por ahí.
 *
 * No es una frontera de seguridad (la sesión ya existe); los permisos reales
 * siguen siendo requireAdmin y la RLS.
 */
export type PostLoginOutcome =
  | { next: "/admin" | "/auth/mfa" | "/auth/suspended" }
  | { error: "wrongPortal" | "forbidden" };

export function postLoginOutcome(state: AccountState, portal: Portal): PostLoginOutcome {
  if (state.kind === "signed_out" || state.kind === "no_account") return { error: "forbidden" };
  if (portalFor(state.role) !== portal) return { error: "wrongPortal" };
  if (state.kind === "mfa_pending") return { next: "/auth/mfa" };
  if (state.kind === "suspended") return { next: "/auth/suspended" };
  return { next: "/admin" };
}

// ---------------------------------------------------------------------------
// Qué puede hacer un admin sobre una cuenta
// ---------------------------------------------------------------------------

export type AccountAction =
  | "name"
  | "email"
  | "role"
  | "org"
  | "suspend"
  | "reactivate"
  | "resetLink"
  | "setPassword"
  | "resendInvite"
  | "cancelInvite";

export interface AccountTarget {
  userId: string;
  role: Role;
  suspended: boolean;
  /** Invitación sin aceptar: nunca confirmó el email ni entró. */
  pending: boolean;
}

export type AccountGuardError =
  | "self"
  | "otherAdmin"
  | "suspended"
  | "notSuspended"
  | "alreadySuspended"
  | "pending"
  | "notPending";

/**
 * `null` = permitido. Reglas:
 * - Sobre la propia cuenta, nada: se usa Seguridad (y así nadie se suspende ni
 *   se quita el rol a sí mismo).
 * - A otro admin no se le cambia el email ni la contraseña: solo se le manda el
 *   link de restablecer, que le llega a su propio correo.
 * - Con la cuenta suspendida no se tocan credenciales (no hay nada que
 *   restablecer hasta reactivarla).
 * - Con la invitación pendiente, lo que corresponde es reenviarla, no un link
 *   de restablecer.
 */
export function canManageAccount(
  actorId: string,
  target: AccountTarget,
  action: AccountAction,
): AccountGuardError | null {
  if (actorId === target.userId) return "self";
  switch (action) {
    case "email":
    case "setPassword":
      if (target.role === "admin") return "otherAdmin";
      if (action === "setPassword" && target.suspended) return "suspended";
      return null;
    case "resetLink":
      if (target.suspended) return "suspended";
      if (target.pending) return "pending";
      return null;
    case "resendInvite":
    case "cancelInvite":
      return target.pending ? null : "notPending";
    case "suspend":
      return target.suspended ? "alreadySuspended" : null;
    case "reactivate":
      return target.suspended ? null : "notSuspended";
    default:
      return null;
  }
}

/**
 * ¿Este cambio deja al panel sin admins activos? Pre-chequeo para el mensaje;
 * la base lo impide igual (trigger `last_admin`).
 */
export function removesLastAdmin(input: {
  targetIsActiveAdmin: boolean;
  /** Admins activos (no suspendidos, org habilitada), incluido el destino. */
  activeAdmins: number;
}): boolean {
  return input.targetIsActiveAdmin && input.activeAdmins <= 1;
}

/** Una org con admins activos no se suspende (se quedarían afuera). */
export function canSuspendOrg(input: { activeAdminsInOrg: number; suspended: boolean }):
  | "orgHasAdmins"
  | "alreadySuspended"
  | null {
  if (input.suspended) return "alreadySuspended";
  return input.activeAdminsInOrg > 0 ? "orgHasAdmins" : null;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

/**
 * Slug de una org a partir del nombre ("Acmé  S.A." → "acme-s-a"). Cumple el
 * CHECK de `organizations.slug` (0025). No cambia después de creada: el script
 * de provisión la identifica por el slug.
 */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  if (SLUG_RE.test(base)) return base;
  const padded = `org-${base}`.replace(/-+$/g, "").slice(0, 63);
  return SLUG_RE.test(padded) ? padded : "org";
}

/** El slug, o el primero libre de `slug-2`, `slug-3`… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `-${i}`;
    const candidate = `${base.slice(0, 63 - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Nombre de org: sin espacios de más, hasta 120 caracteres. */
export function normalizeOrgName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

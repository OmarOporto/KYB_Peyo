/**
 * Reglas de acceso por organización.
 *
 * Todo lo del panel pertenece a una org (ver 0025_organizations.sql). Un
 * miembro solo ve y toca lo de la suya; el `admin` de plataforma, todo. Estas
 * funciones deciden eso y nada más: no leen la base.
 *
 * Sin `import "server-only"` ni alias `@/` a propósito, como en
 * lib/kyb/storagePaths.ts: así se prueban con `node --test`.
 */

export type Role = "analyst" | "admin";

/** Lo mínimo de un analista que hace falta para decidir acceso. */
export interface TenantActor {
  role: Role;
  orgId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ¿Es un uuid? Los ids llegan de la URL o de un Server Action (un POST que
 * cualquiera puede armar a mano): uno mal formado haría fallar la consulta con
 * un 22P02 en vez de un "no encontrado".
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** ¿Puede el actor ver o actuar sobre algo de la org `orgId`? */
export function canAccessOrg(
  actor: TenantActor,
  orgId: string | null | undefined,
): boolean {
  if (!orgId) return false;
  return actor.role === "admin" || actor.orgId === orgId;
}

/**
 * Org por la que se filtra un listado (`?org=`).
 *
 * - Miembro: SIEMPRE la suya. El parámetro se ignora: es un filtro del admin,
 *   no un permiso, y hacerle caso sería la fuga más barata posible.
 * - Admin: la que eligió, si es una org conocida; si no, `null` = todas.
 */
export function resolveOrgScope(
  actor: TenantActor,
  param: string | null | undefined,
  knownOrgIds: readonly string[],
): string | null {
  if (actor.role !== "admin") return actor.orgId;
  if (!isUuid(param) || !knownOrgIds.includes(param)) return null;
  return param;
}

/**
 * Org donde se crea un recurso de primer nivel (formulario, API key).
 *
 * - Miembro: la suya, pida lo que pida.
 * - Admin: la que eligió en el diálogo, o la suya si no eligió ninguna.
 *   Una org que no existe es un error (`null`) y no un fallback silencioso a
 *   la propia: crear el formulario de un cliente dentro de Peyo es peor que
 *   no crearlo.
 */
export function resolveCreationOrg(
  actor: TenantActor,
  requested: string | null | undefined,
  knownOrgIds: readonly string[],
): string | null {
  if (actor.role !== "admin") return actor.orgId;
  if (!requested) return actor.orgId;
  return isUuid(requested) && knownOrgIds.includes(requested) ? requested : null;
}

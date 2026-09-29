import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Role } from "./tenantRules";

export interface Analyst {
  userId: string;
  email: string;
  role: Role;
  /** Organización a la que pertenece (ver 0025_organizations.sql). */
  orgId: string;
  orgName: string;
  fullName: string | null;
}

/** Sesión sin autenticar (`signedIn: false`) vs autenticada sin fila de analista. */
type AuthState = { signedIn: boolean; analyst: Analyst | null };

type OrgEmbed = { name: string; disabled_at: string | null };

/**
 * `cache()`: el layout, la página y cada `isAdmin()` lo piden en el mismo
 * render, y sin memo cada llamada era un `getUser()` de red.
 */
const resolveAnalyst = cache(async (): Promise<AuthState> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, analyst: null };

  const { data: analyst } = await supabase
    .from("analysts")
    .select("user_id, email, role, org_id, full_name, disabled_at, org:organizations(name, disabled_at)")
    .eq("user_id", user.id)
    .maybeSingle();

  // El embed de la org pasa por su RLS, que ya excluye orgs y usuarios
  // deshabilitados: sin org resuelta, no hay acceso.
  const rawOrg = analyst?.org as OrgEmbed | OrgEmbed[] | null | undefined;
  const org = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
  if (!analyst || analyst.disabled_at || !org || org.disabled_at) {
    return { signedIn: true, analyst: null };
  }

  return {
    signedIn: true,
    analyst: {
      userId: analyst.user_id as string,
      // El email de Auth es la fuente de verdad (el usuario lo puede cambiar);
      // `analysts.email` es una copia.
      email: user.email ?? (analyst.email as string),
      role: analyst.role as Role,
      orgId: analyst.org_id as string,
      orgName: org.name,
      fullName: (analyst.full_name as string | null) ?? null,
    },
  };
});

/**
 * Analista autenticado, o `null`. Variante sin redirect para Route Handlers,
 * que deben responder 401 JSON a un `fetch` en vez de mandar un redirect.
 */
export async function getAnalyst(): Promise<Analyst | null> {
  return (await resolveAnalyst()).analyst;
}

/** Exige un analista autenticado; redirige a /admin/login si no lo hay. */
export async function requireAnalyst(): Promise<Analyst> {
  const { signedIn, analyst } = await resolveAnalyst();
  if (!analyst) redirect(signedIn ? "/admin/login?error=forbidden" : "/admin/login");
  return analyst;
}

/**
 * Exige rol `admin` (de plataforma), no solo ser analista.
 *
 * Ojo: `analysts.role` tiene default `'analyst'` (0001_init.sql), así que un
 * panel sin ninguna fila con `role='admin'` deja estas acciones inaccesibles
 * para todos.
 */
export async function requireAdmin(): Promise<Analyst> {
  const analyst = await requireAnalyst();
  if (analyst.role !== "admin") redirect("/admin?error=forbidden");
  return analyst;
}

/** Variante sin redirect, para Server Actions que responden un `Result`. */
export async function isAdmin(): Promise<boolean> {
  return (await getAnalyst())?.role === "admin";
}

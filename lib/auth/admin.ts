import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Role } from "./tenantRules";
import { mfaGate } from "./mfaGate";

export interface Analyst {
  userId: string;
  email: string;
  role: Role;
  /** Organización a la que pertenece (ver 0025_organizations.sql). */
  orgId: string;
  orgName: string;
  fullName: string | null;
}

/**
 * Estado de la sesión: sin autenticar (`signedIn: false`), autenticada pero
 * con el 2FA pendiente (`mfaPending`), o autenticada con o sin fila de analista.
 */
export type AuthState = {
  signedIn: boolean;
  mfaPending: boolean;
  /** Email de la sesión (aunque no sea analista o le falte el 2FA). */
  email: string | null;
  analyst: Analyst | null;
};

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
  if (!user) return { signedIn: false, mfaPending: false, email: null, analyst: null };

  // 2FA: los factores salen de getUser() (servidor de Auth), no de la cookie.
  // Con el 2FA pendiente ni se mira la fila de analista: la RLS ya no deja leer
  // la org (mfa_ok, 0026) y quedaría como "sin acceso" en vez de "falta el código".
  const verifiedFactors = (user.factors ?? []).filter((f) => f.status === "verified").length;
  if (verifiedFactors > 0) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaGate({ currentLevel: aal?.currentLevel, verifiedFactors }) === "pending") {
      return { signedIn: true, mfaPending: true, email: user.email ?? null, analyst: null };
    }
  }

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
    return { signedIn: true, mfaPending: false, email: user.email ?? null, analyst: null };
  }

  return {
    signedIn: true,
    mfaPending: false,
    email: user.email ?? null,
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

/** Estado completo de la sesión (para las pantallas de acceso). */
export async function getAuthState(): Promise<AuthState> {
  return resolveAnalyst();
}

/**
 * Analista autenticado, o `null` (también con el 2FA pendiente). Variante sin
 * redirect para Route Handlers, que deben responder 401 JSON a un `fetch` en
 * vez de mandar un redirect.
 */
export async function getAnalyst(): Promise<Analyst | null> {
  return (await resolveAnalyst()).analyst;
}

/**
 * Exige un analista autenticado; redirige al login si no lo hay, o al
 * paso del código si tiene 2FA y todavía no lo pasó.
 */
export async function requireAnalyst(): Promise<Analyst> {
  const { signedIn, mfaPending, analyst } = await resolveAnalyst();
  if (mfaPending) redirect("/auth/mfa");
  if (!analyst) redirect(signedIn ? "/login?error=forbidden" : "/login");
  return analyst;
}

/**
 * Exige rol `admin` (de plataforma), no solo ser analista. Para cualquier otro
 * la página o la acción "no existe" (404): no se anuncia qué hay detrás.
 *
 * Ojo: `analysts.role` tiene default `'analyst'` (0001_init.sql), así que un
 * panel sin ninguna fila con `role='admin'` deja estas acciones inaccesibles
 * para todos.
 */
export async function requireAdmin(): Promise<Analyst> {
  const analyst = await requireAnalyst();
  if (analyst.role !== "admin") notFound();
  return analyst;
}

/** Variante sin redirect, para Server Actions que responden un `Result`. */
export async function isAdmin(): Promise<boolean> {
  return (await getAnalyst())?.role === "admin";
}

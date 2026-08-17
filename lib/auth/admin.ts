import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export interface Analyst {
  userId: string;
  email: string;
  role: "analyst" | "admin";
}

/** Sesión sin autenticar (`signedIn: false`) vs autenticada sin fila de analista. */
type AuthState = { signedIn: boolean; analyst: Analyst | null };

async function resolveAnalyst(): Promise<AuthState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, analyst: null };

  const { data: analyst } = await supabase
    .from("analysts")
    .select("user_id, email, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!analyst) return { signedIn: true, analyst: null };

  return {
    signedIn: true,
    analyst: {
      userId: analyst.user_id as string,
      email: analyst.email as string,
      role: analyst.role as "analyst" | "admin",
    },
  };
}

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

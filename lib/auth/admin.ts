import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export interface Analyst {
  userId: string;
  email: string;
  role: "analyst" | "admin";
}

/** Exige un analista autenticado; redirige a /admin/login si no lo hay. */
export async function requireAnalyst(): Promise<Analyst> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: analyst } = await supabase
    .from("analysts")
    .select("user_id, email, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!analyst) redirect("/admin/login?error=forbidden");

  return {
    userId: analyst.user_id as string,
    email: analyst.email as string,
    role: analyst.role as "analyst" | "admin",
  };
}

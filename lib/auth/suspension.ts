import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Datos para la pantalla de cuenta suspendida: el email del admin que se eligió
 * como contacto al suspender, y el nombre de la org si la suspendida es ella.
 *
 * Con service role a propósito: por RLS un suspendido solo puede leer su propia
 * fila de `analysts`, no la del admin de contacto ni su org. Quien llama tiene
 * que haber verificado antes que la sesión es la de ese usuario y que está
 * suspendido (getAuthState).
 */
export async function suspensionInfo(
  userId: string,
  scope: "user" | "org",
): Promise<{ contactEmail: string | null; orgName: string | null }> {
  const supabase = createServiceClient();
  const { data: me } = await supabase
    .from("analysts")
    .select("org_id, suspension_contact_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!me) return { contactEmail: null, orgName: null };

  let contactId = (me.suspension_contact_id as string | null) ?? null;
  let orgName: string | null = null;
  if (scope === "org") {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, suspension_contact_id")
      .eq("id", me.org_id as string)
      .maybeSingle();
    orgName = (org?.name as string | undefined) ?? null;
    contactId = (org?.suspension_contact_id as string | null) ?? null;
  }
  if (!contactId) return { contactEmail: null, orgName };

  const { data: contact } = await supabase
    .from("analysts")
    .select("email")
    .eq("user_id", contactId)
    .maybeSingle();
  return { contactEmail: (contact?.email as string | undefined) ?? null, orgName };
}

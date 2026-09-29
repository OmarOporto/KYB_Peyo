"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { confirmDestination, parseConfirmLink } from "@/lib/auth/confirmLink";

/**
 * Verifica el link de un correo de Auth (recuperación, invitación, cambio de
 * email) y deja la sesión en cookies. Corre en el POST del botón "Continuar",
 * no al abrir el link: los escáneres de correo (Outlook SafeLinks y compañía)
 * abren los links solos y, si verificara en el GET, gastarían el token de un
 * solo uso antes que la persona.
 */
export async function confirmLinkAction(formData: FormData) {
  const link = parseConfirmLink({
    token_hash: formData.get("token_hash")?.toString(),
    type: formData.get("type")?.toString(),
  });
  if (!link) redirect("/admin/login/confirm?error=invalid");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    type: link.type,
    token_hash: link.tokenHash,
  });
  if (error) {
    redirect(`/admin/login/confirm?error=${error.code === "otp_expired" ? "expired" : "invalid"}`);
  }

  // Cambio de email con doble confirmación: el primer link (de cualquiera de
  // las dos direcciones) se acepta sin cambiar nada todavía.
  if (link.type === "email_change" && !data.session) {
    redirect("/admin/login/confirm?pending=email");
  }

  redirect(confirmDestination(link.type));
}

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthState } from "@/lib/auth/admin";
import { signOutAction } from "@/app/admin/actions";
import { AuthHeading } from "@/components/auth/authUi";
import { MfaForm } from "@/components/auth/MfaForm";

export const dynamic = "force-dynamic";

/**
 * Segundo paso del login para quien activó el 2FA: la contraseña ya pasó
 * (sesión aal1) y falta el código de la app de autenticación.
 */
export default async function MfaPage() {
  const state = await getAuthState();
  if (!state.signedIn) redirect("/admin/login");
  if (!state.mfaPending) redirect("/admin");

  const t = await getTranslations("auth");
  return (
    <>
      <AuthHeading title={t("mfaTitle")} subtitle={t("mfaSubtitle", { email: state.email ?? "" })} />
      <MfaForm redirectTo="/admin" />
      <div className="mt-6 space-y-2 text-sm text-muted">
        <p>{t("mfaLostDevice")}</p>
        <form action={signOutAction}>
          <button className="cursor-pointer font-medium text-brand hover:underline">
            {t("useOtherAccount")}
          </button>
        </form>
      </div>
    </>
  );
}

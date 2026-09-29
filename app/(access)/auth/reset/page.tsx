import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getAuthState } from "@/lib/auth/admin";
import { AuthAlert, AuthHeading } from "@/components/auth/authUi";
import { MfaForm } from "@/components/auth/MfaForm";
import { ResetForm } from "./ResetForm";

export const dynamic = "force-dynamic";

/**
 * Nueva contraseña. Se llega desde el link del correo de recuperación o de
 * invitación (/auth/confirm deja la sesión en cookies). Sin sesión, el
 * link ya se usó o venció.
 *
 * Con 2FA activo el link del correo solo da una sesión aal1: se pide el código
 * antes. Si no, quien tuviera acceso al correo se saltearía el segundo factor
 * (y Supabase rechazaría el cambio igual, con `insufficient_aal`).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const t = await getTranslations("auth");
  const invite = (await searchParams).invite === "1";
  const state = await getAuthState();

  if (!state.signedIn) {
    return (
      <>
        <AuthHeading title={t("confirmErrorTitle")} />
        <AuthAlert tone="danger">{t("resetNoSession")}</AuthAlert>
        <Link href="/auth/forgot" className="font-medium text-brand hover:underline">
          {t("requestNewLink")}
        </Link>
      </>
    );
  }

  if (state.mfaPending) {
    return (
      <>
        <AuthHeading title={t("mfaTitle")} subtitle={t("resetMfaSubtitle")} />
        <MfaForm />
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title={invite ? t("inviteTitle") : t("resetTitle")}
        subtitle={t("resetSubtitle", { email: state.email ?? "" })}
      />
      <ResetForm />
    </>
  );
}

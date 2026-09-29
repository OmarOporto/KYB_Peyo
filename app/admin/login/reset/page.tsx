import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { AuthAlert, AuthHeading } from "@/components/auth/authUi";
import { ResetForm } from "./ResetForm";

export const dynamic = "force-dynamic";

/**
 * Nueva contraseña. Se llega desde el link del correo de recuperación o de
 * invitación (/admin/login/confirm deja la sesión en cookies). Sin sesión, el
 * link ya se usó o venció.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const t = await getTranslations("auth");
  const invite = (await searchParams).invite === "1";
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <AuthHeading title={t("confirmErrorTitle")} />
        <AuthAlert tone="danger">{t("resetNoSession")}</AuthAlert>
        <Link href="/admin/login/forgot" className="font-medium text-brand hover:underline">
          {t("requestNewLink")}
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title={invite ? t("inviteTitle") : t("resetTitle")}
        subtitle={t("resetSubtitle", { email: user.email ?? "" })}
      />
      <ResetForm />
    </>
  );
}

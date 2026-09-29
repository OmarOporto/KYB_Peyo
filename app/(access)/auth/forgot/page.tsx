import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AuthHeading } from "@/components/auth/authUi";
import { loginPath, parsePortal } from "@/lib/auth/accountRules";
import { ForgotForm } from "./ForgotForm";

/** Recuperar contraseña, compartida por los dos portales (`?p=admin` vuelve al de admin). */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const t = await getTranslations("auth");
  const back = loginPath(parsePortal((await searchParams).p));
  return (
    <>
      <Link
        href={back}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft size={16} aria-hidden />
        {t("backToLogin")}
      </Link>
      <AuthHeading title={t("forgotTitle")} subtitle={t("forgotSubtitle")} />
      <ForgotForm />
    </>
  );
}

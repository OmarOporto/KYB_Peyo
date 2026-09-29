import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { AuthHeading } from "@/components/auth/authUi";
import { ForgotForm } from "./ForgotForm";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <>
      <Link
        href="/admin/login"
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

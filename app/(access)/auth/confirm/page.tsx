import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { parseConfirmLink } from "@/lib/auth/confirmLink";
import { AuthAlert, AuthHeading, authButtonCls } from "@/components/auth/authUi";
import { confirmLinkAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Destino de los links de los correos de Auth. Muestra un botón y verifica en
 * el POST (ver confirmLinkAction): abrir el link no gasta el token.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    error?: string;
    pending?: string;
  }>;
}) {
  const t = await getTranslations("auth");
  const sp = await searchParams;

  if (sp.pending === "email") {
    return (
      <>
        <AuthHeading title={t("confirmEmailPendingTitle")} />
        <AuthAlert tone="info">{t("confirmEmailPendingBody")}</AuthAlert>
      </>
    );
  }

  const link = parseConfirmLink(sp);
  if (sp.error || !link) {
    return (
      <>
        <AuthHeading title={t("confirmErrorTitle")} />
        <AuthAlert tone="danger">
          {sp.error === "expired" ? t("errLinkExpired") : t("confirmInvalid")}
        </AuthAlert>
        <Link href="/auth/forgot" className="font-medium text-brand hover:underline">
          {t("requestNewLink")}
        </Link>
      </>
    );
  }

  const copy = {
    recovery: { title: t("confirmRecoveryTitle"), body: t("confirmRecoveryBody") },
    invite: { title: t("confirmInviteTitle"), body: t("confirmInviteBody") },
    email_change: { title: t("confirmEmailTitle"), body: t("confirmEmailBody") },
  }[link.type];

  return (
    <>
      <AuthHeading title={copy.title} subtitle={copy.body} />
      <form action={confirmLinkAction}>
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <input type="hidden" name="type" value={link.type} />
        <button type="submit" className={authButtonCls}>
          {t("continue")}
        </button>
      </form>
    </>
  );
}

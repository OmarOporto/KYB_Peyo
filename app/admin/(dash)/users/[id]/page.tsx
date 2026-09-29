import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/admin";
import { getAccount, listActiveAdmins } from "@/lib/auth/accounts";
import { listOrgs } from "@/lib/auth/tenant";
import { isUuid } from "@/lib/auth/tenantRules";
import { buttonClass } from "@/components/ui/Button";
import { AccountStatusBadge, RoleBadge } from "../badges";
import { AccountPanels } from "./AccountPanels";
import { CredentialsPanel } from "./CredentialsPanel";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [account, orgs, admins] = await Promise.all([getAccount(id), listOrgs(), listActiveAdmins()]);
  if (!account) notFound();

  const t = await getTranslations("accounts");
  const locale = await getLocale();
  const fmt = (v: string | null) =>
    v ? new Date(v).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const isSelf = account.userId === actor.userId;

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <Link
        href="/admin/users"
        className={buttonClass({ variant: "quiet", size: "sm", className: "-ml-3" })}
      >
        <ArrowLeft size={16} aria-hidden />
        {t("backToUsers")}
      </Link>

      <header className="mt-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {account.fullName || account.email}
          </h1>
          <RoleBadge role={account.role} />
          <AccountStatusBadge status={account.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {account.email} · {account.orgName}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t("lastSignIn")}: {fmt(account.lastSignInAt)} · 2FA: {account.mfa ? t("yes") : t("no")}
          {account.status === "suspended" && account.contactEmail && (
            <> · {t("contactShort")}: {account.contactEmail}</>
          )}
        </p>
      </header>

      {isSelf ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          {t("selfNotice")}{" "}
          <Link href="/admin/security" className="font-medium text-brand hover:underline">
            {t("needs2faLink")}
          </Link>
        </p>
      ) : (
        <AccountPanels
          account={account}
          orgs={orgs.filter((o) => !o.disabled || o.id === account.orgId)}
          admins={admins}
          actorId={actor.userId}
          canManage={actor.mfaEnabled}
        >
          <CredentialsPanel account={account} />
        </AccountPanels>
      )}
    </main>
  );
}

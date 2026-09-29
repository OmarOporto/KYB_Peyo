import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveListScope } from "@/lib/auth/tenant";
import { listAccounts, listActiveAdmins, listOrgSummaries } from "@/lib/auth/accounts";
import { Card } from "@/components/ui/Card";
import { TabLink } from "@/components/admin/TabLink";
import { OrgTabs } from "@/components/admin/OrgTabs";
import { AccountStatusBadge, RoleBadge } from "./badges";
import { OrgsPanel } from "./OrgsPanel";
import { NewAccountPanel } from "./NewAccountPanel";

export const dynamic = "force-dynamic";

/**
 * Gestión de cuentas (solo admin): usuarios del panel y organizaciones.
 * Modificar exige además que el admin tenga 2FA activo (users/actions.ts).
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; org?: string }>;
}) {
  const analyst = await requireAdmin();
  const t = await getTranslations("accounts");
  const locale = await getLocale();
  const sp = await searchParams;
  const tab = sp.tab === "orgs" ? "orgs" : "users";
  const canManage = analyst.mfaEnabled;

  return (
    <main className="w-full p-6 xl:px-8">
      <h1 className="font-display text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mt-0.5 mb-4 text-sm text-muted">{t("subtitle")}</p>

      {!canManage && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <p>
            {t("needs2fa")}{" "}
            <Link href="/admin/security" className="font-medium text-brand hover:underline">
              {t("needs2faLink")}
            </Link>
          </p>
        </div>
      )}

      <nav aria-label={t("title")} className="mb-5 flex gap-1 border-b border-border">
        <TabLink href="/admin/users" label={t("tabUsers")} isActive={tab === "users"} />
        <TabLink href="/admin/users?tab=orgs" label={t("tabOrgs")} isActive={tab === "orgs"} />
      </nav>

      {tab === "users" ? (
        <UsersTab orgParam={sp.org} locale={locale} analyst={analyst} canManage={canManage} />
      ) : (
        <OrgsTab canManage={canManage} actorId={analyst.userId} />
      )}
    </main>
  );
}

async function UsersTab({
  orgParam,
  locale,
  analyst,
  canManage,
}: {
  orgParam?: string;
  locale: string;
  analyst: Awaited<ReturnType<typeof requireAdmin>>;
  canManage: boolean;
}) {
  const t = await getTranslations("accounts");
  const [{ scope, orgs }, accounts] = await Promise.all([
    resolveListScope(analyst, orgParam),
    listAccounts(),
  ]);
  const rows = scope ? accounts.filter((a) => a.orgId === scope) : accounts;
  const fmt = (v: string | null) =>
    v ? new Date(v).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <>
      {canManage && (
        <NewAccountPanel orgs={orgs.filter((o) => !o.disabled)} defaultOrg={scope ?? analyst.orgId} />
      )}
      <OrgTabs
        orgs={orgs}
        active={scope}
        hrefFor={(id) => (id ? `/admin/users?org=${id}` : "/admin/users")}
      />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("colUser")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colOrg")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colRole")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-2.5 font-medium">{t("col2fa")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colLastSignIn")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.userId} className="border-t border-border hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/users/${a.userId}`}
                      className="block font-medium text-foreground hover:text-brand"
                    >
                      {a.fullName || a.email}
                    </Link>
                    {a.fullName && <span className="block text-xs text-muted">{a.email}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{a.orgName}</td>
                  <td className="px-4 py-2.5">
                    <RoleBadge role={a.role} />
                  </td>
                  <td className="px-4 py-2.5">
                    <AccountStatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-2.5 text-muted">{a.mfa ? t("yes") : t("no")}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">{fmt(a.lastSignInAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

async function OrgsTab({ canManage, actorId }: { canManage: boolean; actorId: string }) {
  const [orgs, admins] = await Promise.all([listOrgSummaries(), listActiveAdmins()]);
  return <OrgsPanel orgs={orgs} admins={admins} canManage={canManage} actorId={actorId} />;
}

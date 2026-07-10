import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import {
  listWorkflows,
  listQuestionnaires,
  DiditNotConfiguredError,
} from "@/lib/didit/questionnaires";
import { StatusBadge } from "@/components/admin/StatusBadge";

export const dynamic = "force-dynamic";

export default async function DiditPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getTranslations("didit");
  const { tab } = await searchParams;
  const active = tab === "questionnaires" ? "questionnaires" : "workflows";

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <h1 className="font-display text-2xl font-bold text-foreground">
        {t("title")}
      </h1>
      <p className="mt-1 mb-4 text-sm text-muted">{t("subtitle")}</p>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-border">
        <TabLink href="/admin/didit" label={t("tabWorkflows")} isActive={active === "workflows"} />
        <TabLink
          href="/admin/didit?tab=questionnaires"
          label={t("tabQuestionnaires")}
          isActive={active === "questionnaires"}
        />
      </div>

      {active === "workflows" ? <WorkflowsTab /> : <QuestionnairesTab />}
    </main>
  );
}

function TabLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "border-brand text-brand"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

async function NotConfigured() {
  const t = await getTranslations("didit");
  return (
    <Card className="p-6">
      <p className="font-medium text-foreground">{t("noApiKey")}</p>
      <p className="mt-1 text-sm text-muted">{t("noApiKeyHint")}</p>
    </Card>
  );
}

async function WorkflowsTab() {
  const t = await getTranslations("didit");
  let items;
  try {
    items = await listWorkflows();
  } catch (e) {
    if (e instanceof DiditNotConfiguredError) return <NotConfigured />;
    return (
      <Card className="p-6">
        <p className="text-sm text-muted">{t("errorLoading")}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("colWorkflow")}</th>
              <th className="px-4 py-2.5 font-medium">{t("colType")}</th>
              <th className="px-4 py-2.5 font-medium">{t("colFeatures")}</th>
              <th className="px-4 py-2.5 font-medium">{t("colVersion")}</th>
              <th className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.uuid} className="border-t border-border hover:bg-surface-2">
                <td className="px-4 py-2.5 font-medium text-foreground">
                  {w.workflow_label ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted uppercase">{w.workflow_type ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {w.hasQuestionnaire ? (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      {t("hasQuestionnaire")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">v{w.version ?? "?"}</td>
                <td className="px-4 py-2.5">
                  {w.status && <StatusBadge status={w.status} />}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/admin/didit/workflow/${w.uuid}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {t("view")} →
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {t("emptyWorkflows")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function QuestionnairesTab() {
  const t = await getTranslations("didit");
  let items;
  try {
    items = await listQuestionnaires();
  } catch (e) {
    if (e instanceof DiditNotConfiguredError) return <NotConfigured />;
    return (
      <Card className="p-6">
        <p className="text-sm text-muted">{t("errorLoading")}</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("colTitle")}</th>
              <th className="px-4 py-2.5 font-medium">{t("colVersion")}</th>
              <th className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-2.5 font-medium">{t("colTypes")}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((q) => (
              <tr key={q.uuid} className="border-t border-border hover:bg-surface-2">
                <td className="px-4 py-2.5 font-medium text-foreground">{q.title ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">v{q.version ?? "?"}</td>
                <td className="px-4 py-2.5">{q.status && <StatusBadge status={q.status} />}</td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {(q.question_types ?? []).length} preguntas
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/admin/didit/${q.uuid}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {t("view")} →
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

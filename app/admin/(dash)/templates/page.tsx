import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

type TemplateRow = {
  id: string;
  name: string;
  source: string;
  source_ref: string | null;
  definition: { questionCount?: number; sections?: unknown[] } | null;
  updated_at: string;
};

export default async function TemplatesList() {
  const t = await getTranslations("templates");
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("form_templates")
    .select("id, name, source, source_ref, definition, updated_at")
    .order("updated_at", { ascending: false });

  const templates = (data ?? []) as TemplateRow[];

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-4 font-display text-2xl font-bold text-foreground">
        {t("title")}
      </h1>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("colName")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colSource")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colQuestions")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colUpdated")}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => {
                const isWorkflow = tpl.source === "didit-workflow";
                const count =
                  tpl.definition?.questionCount ??
                  tpl.definition?.sections?.length ??
                  0;
                return (
                  <tr key={tpl.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-2.5 font-medium text-foreground">{tpl.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                        {isWorkflow ? t("sourceWorkflow") : t("sourceQuestionnaire")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{count}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {new Date(tpl.updated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/templates/${tpl.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {t("view")} →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center">
                    <p className="text-muted">{t("empty")}</p>
                    <p className="mt-1 text-sm text-muted">
                      {t("emptyHint")}{" "}
                      <Link href="/admin/didit" className="text-brand hover:underline">
                        {t("goToDidit")}
                      </Link>
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

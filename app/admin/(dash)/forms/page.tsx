import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { countFields, type FormDefinition } from "@/lib/forms/definition";
import { FormsToolbar } from "./FormsToolbar";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  status: string;
  source: string;
  definition: FormDefinition;
  updated_at: string;
};

export default async function FormsList() {
  const t = await getTranslations("forms");
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("forms")
    .select("id, name, status, source, definition, updated_at")
    .order("updated_at", { ascending: false });

  const forms = (data ?? []) as Row[];

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-4 font-display text-2xl font-bold text-foreground">
        {t("title")}
      </h1>

      <FormsToolbar />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("colName")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colFields")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colSource")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colUpdated")}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id} className="border-t border-border hover:bg-surface-2">
                  <td className="px-4 py-2.5 font-medium text-foreground">{f.name}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        f.status === "published"
                          ? "bg-success/15 text-success"
                          : "bg-surface-2 text-muted"
                      }`}
                    >
                      {f.status === "published" ? t("published") : t("draft")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {f.definition.sections.length} · {countFields(f.definition)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted uppercase">{f.source}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {new Date(f.updated_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/forms/${f.id}/edit`}
                      className="font-medium text-brand hover:underline"
                    >
                      {t("edit")} →
                    </Link>
                  </td>
                </tr>
              ))}
              {forms.length === 0 && (
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
    </main>
  );
}

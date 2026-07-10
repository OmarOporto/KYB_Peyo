import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { DiditFlow } from "@/components/admin/DiditFlow";
import { assembleWorkflow } from "@/lib/didit/questionnaires";
import { importWorkflow } from "../../actions";
import { ImportButton } from "../../[uuid]/ImportButton";

export const dynamic = "force-dynamic";

export default async function WorkflowDetail({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const t = await getTranslations("didit");
  const locale = await getLocale();

  const form = await assembleWorkflow(uuid);

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href="/admin/didit" className="text-sm text-brand hover:underline">
        ← {t("detailBack")}
      </Link>

      <header className="mt-3 mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {form.source.label ?? uuid}
          </h1>
          <p className="text-sm text-muted">
            {form.questionnaires.length} {t("questionnairesCount")} ·{" "}
            {form.questionCount} {t("questions")}
          </p>
        </div>
        <form action={importWorkflow.bind(null, uuid)}>
          <ImportButton />
        </form>
      </header>

      {form.questionCount === 0 && (
        <Card className="p-6">
          <p className="text-sm text-muted">{t("noQuestions")}</p>
        </Card>
      )}

      <div className="space-y-6">
        {form.questionnaires.map((q) => (
          <section key={q.uuid}>
            <h2 className="mb-2 font-display text-lg font-semibold text-foreground">
              {q.title ?? "—"}
            </h2>
            <DiditFlow
              sections={q.sections}
              locale={locale}
              labels={{
                required: t("required"),
                optional: t("optional"),
                options: t("options"),
              }}
            />
          </section>
        ))}
      </div>
    </main>
  );
}

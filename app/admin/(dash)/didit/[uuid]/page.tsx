import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { DiditFlow } from "@/components/admin/DiditFlow";
import {
  retrieveQuestionnaireRaw,
  normalizeQuestionnaire,
} from "@/lib/didit/questionnaires";
import { importQuestionnaire } from "../actions";
import { ImportButton } from "./ImportButton";

export const dynamic = "force-dynamic";

export default async function DiditQuestionnaireDetail({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const t = await getTranslations("didit");
  const locale = await getLocale();

  const raw = await retrieveQuestionnaireRaw(uuid);
  const q = normalizeQuestionnaire(raw);

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link
        href="/admin/didit?tab=questionnaires"
        className="text-sm text-brand hover:underline"
      >
        ← {t("detailBack")}
      </Link>

      <header className="mt-3 mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {q.source.title ?? uuid}
          </h1>
          <p className="text-sm text-muted">
            v{q.source.version ?? "?"} · {q.questionCount} {t("questions")}
          </p>
        </div>
        <form action={importQuestionnaire.bind(null, uuid)}>
          <ImportButton />
        </form>
      </header>

      {q.questionCount === 0 && (
        <Card className="p-6">
          <p className="text-sm text-muted">{t("noQuestions")}</p>
        </Card>
      )}

      <DiditFlow
        sections={q.sections}
        locale={locale}
        labels={{
          required: t("required"),
          optional: t("optional"),
          options: t("options"),
        }}
      />
    </main>
  );
}

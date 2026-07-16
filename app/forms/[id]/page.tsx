import { getLocale, getTranslations } from "next-intl/server";
import { getPublishedForm } from "@/lib/forms/store";
import { resolveText } from "@/lib/forms/definition";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { PublicForm } from "./PublicForm";

export const dynamic = "force-dynamic";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("form");
  const locale = await getLocale();
  const form = await getPublishedForm(id);

  if (!form) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center p-8">
          <Card className="w-full p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-foreground">
              {t("unavailableTitle")}
            </h1>
            <p className="mt-2 text-muted">{t("unavailableBody")}</p>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 p-6">
        <h1 className="mb-4 font-display text-2xl font-bold text-foreground">
          {resolveText(form.definition.title, locale)}
        </h1>
        <PublicForm formId={form.id} />
      </main>
    </>
  );
}

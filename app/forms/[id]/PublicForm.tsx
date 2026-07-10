"use client";

import { useTranslations } from "next-intl";
import { DynamicForm } from "@/components/forms/DynamicForm";
import type { FormDefinition } from "@/lib/forms/definition";

/** Vista pública de un formulario publicado (preview interactivo, sin persistir). */
export function PublicForm({
  definition,
  locale,
}: {
  definition: FormDefinition;
  locale: string;
}) {
  const t = useTranslations("form");
  return (
    <DynamicForm
      definition={definition}
      locale={locale}
      mode="preview"
      labels={{
        back: t("back"),
        continue: t("continue"),
        submit: t("submit"),
        submitting: t("submitting"),
        done: t("submittedTitle"),
        doneBody: t("submittedBody"),
        saving: t("saving"),
        saved: t("draftSaved"),
        required: t("errRequired"),
        invalidEmail: t("errEmail"),
        invalidNumber: t("errNumber"),
        invalid: t("errInvalid"),
      }}
    />
  );
}

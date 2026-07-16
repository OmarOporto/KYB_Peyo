"use client";

import { useTranslations } from "next-intl";
import { DynamicForm } from "@/components/forms/DynamicForm";
import type { Field, FormDefinition } from "@/lib/forms/definition";
import type { Answers } from "@/lib/forms/logic";
import { saveDraftAction, uploadDocumentAction, submitFormAction } from "./actions";

export function ApplicantForm({
  token,
  definition,
  locale,
  initialAnswers,
}: {
  token: string;
  definition: FormDefinition;
  locale: string;
  initialAnswers: Answers;
}) {
  const t = useTranslations("form");

  return (
    <DynamicForm
      definition={definition}
      locale={locale}
      initialAnswers={initialAnswers}
      mode="live"
      onSaveDraft={async (a) => {
        await saveDraftAction(token, a as Record<string, unknown>);
      }}
      onUploadFile={async (file: File, field: Field) => {
        const fd = new FormData();
        fd.set("token", token);
        fd.set("docType", field.key);
        fd.set("file", file);
        const res = await uploadDocumentAction(fd);
        return res.ok && res.path
          ? { path: res.path, filename: res.filename ?? file.name }
          : null;
      }}
      onSubmit={(a) => submitFormAction(token, a as Record<string, unknown>)}
      labels={{
        back: t("back"),
        continue: t("continue"),
        submit: t("submit"),
        submitting: t("submitting"),
        done: t("submittedTitle"),
        doneBody: t("submittedBody"),
        saving: t("saving"),
        saved: t("draftSaved"),
        saveError: t("saveError"),
        submitFailed: t("submitFailed"),
        required: t("errRequired"),
        invalidEmail: t("errEmail"),
        invalidNumber: t("errNumber"),
        invalid: t("errInvalid"),
      }}
    />
  );
}

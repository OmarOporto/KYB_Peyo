"use client";

import { useTranslations } from "next-intl";
import { DynamicForm } from "@/components/forms/DynamicForm";
import type { Field, FormDefinition } from "@/lib/forms/definition";
import type { Answers } from "@/lib/forms/logic";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  saveDraftAction,
  createUploadUrlAction,
  confirmUploadAction,
  deleteDocumentAction,
  submitFormAction,
} from "./actions";

// Duplicado a propósito (el nombre del bucket vive en lib/kyb/service.ts, que es
// server-only y no se puede importar en este componente cliente).
const DOCUMENTS_BUCKET = "kyb-documents";

export function ApplicantForm({
  token,
  definition,
  locale,
  initialAnswers,
  returnUrl,
  mode = "live",
  corrections,
  anchorSectionId,
}: {
  token: string;
  definition: FormDefinition;
  locale: string;
  initialAnswers: Answers;
  returnUrl?: string;
  mode?: "live" | "correction";
  corrections?: { key: string; note: string }[];
  anchorSectionId?: string;
}) {
  const t = useTranslations("form");

  return (
    <DynamicForm
      definition={definition}
      locale={locale}
      initialAnswers={initialAnswers}
      returnUrl={returnUrl}
      mode={mode}
      corrections={corrections}
      anchorSectionId={anchorSectionId}
      onSaveDraft={async (a) => {
        await saveDraftAction(token, a as Record<string, unknown>);
      }}
      onUploadFile={async (file: File, field: Field) => {
        try {
          // 1) El server valida el token y devuelve una signed upload URL scoped.
          const signed = await createUploadUrlAction(token, field.key, file.name);
          if (!signed.ok || !signed.path || !signed.uploadToken) {
            const error = signed.ok ? "No se pudo preparar la subida." : signed.error;
            console.error("[ApplicantForm] signed URL falló:", error);
            return { ok: false as const, error };
          }
          // 2) Subida directa navegador → Storage (sin doble salto por el server).
          const supabase = createBrowserSupabase();
          const up = await supabase.storage
            .from(DOCUMENTS_BUCKET)
            .uploadToSignedUrl(signed.path, signed.uploadToken, file, {
              contentType: file.type || "application/octet-stream",
            });
          if (up.error) {
            console.error("[ApplicantForm] uploadToSignedUrl falló:", up.error.message);
            return { ok: false as const, error: "No se pudo subir el archivo." };
          }
          // 3) Registrar metadatos del archivo ya subido.
          const conf = await confirmUploadAction({
            token,
            path: signed.path,
            docType: field.key,
            filename: file.name,
            mime: file.type || null,
            size: file.size,
          });
          if (!conf.ok) {
            console.error("[ApplicantForm] confirm falló:", conf.error);
            return { ok: false as const, error: conf.error };
          }
          return { ok: true as const, ref: { path: signed.path, filename: file.name } };
        } catch (e) {
          console.error("[ApplicantForm] subida falló:", e);
          return { ok: false as const, error: "No se pudo subir el archivo." };
        }
      }}
      onDeleteFile={async (path: string) => {
        const res = await deleteDocumentAction(token, path);
        return res.ok;
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
        // Plantilla cruda: DynamicForm interpola {count} por su cuenta; t() normal
        // lanzaría FORMATTING_ERROR porque la variable ICU no se provee aquí.
        missingFields: t.raw("missingFields"),
        required: t("errRequired"),
        invalidEmail: t("errEmail"),
        invalidNumber: t("errNumber"),
        invalid: t("errInvalid"),
        // Plantillas crudas: DynamicForm interpola {min}/{max} (patrón missingFields).
        tooShort: t.raw("errTooShort"),
        tooLong: t.raw("errTooLong"),
        returnCta: t("returnCta"),
        redirecting: t("redirecting"),
        correctionBanner: t("correctionBanner"),
        readOnlyNotice: t("readOnlyNotice"),
      }}
    />
  );
}

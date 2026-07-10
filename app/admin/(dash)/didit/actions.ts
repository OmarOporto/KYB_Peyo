"use server";

import { redirect } from "next/navigation";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assembleWorkflow,
  retrieveQuestionnaireRaw,
  normalizeQuestionnaire,
} from "@/lib/didit/questionnaires";

/** Importa un workflow completo de DIDIT como una plantilla y redirige a su preview. */
export async function importWorkflow(uuid: string) {
  await requireAnalyst();

  const form = await assembleWorkflow(uuid);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("form_templates")
    .upsert(
      {
        source: "didit-workflow",
        source_ref: uuid,
        name: form.source.label ?? `DIDIT workflow ${uuid.slice(0, 8)}`,
        definition: form,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source,source_ref" },
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  redirect(`/admin/templates/${data.id}`);
}

/** Importa un questionnaire suelto de DIDIT como plantilla. */
export async function importQuestionnaire(uuid: string) {
  await requireAnalyst();

  const raw = await retrieveQuestionnaireRaw(uuid);
  const normalized = normalizeQuestionnaire(raw);

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("form_templates")
    .upsert(
      {
        source: "didit-questionnaire",
        source_ref: uuid,
        name: normalized.source.title ?? `DIDIT ${uuid.slice(0, 8)}`,
        definition: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source,source_ref" },
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  redirect(`/admin/templates/${data.id}`);
}

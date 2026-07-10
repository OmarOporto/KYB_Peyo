"use server";

import { redirect } from "next/navigation";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assembleWorkflow,
  retrieveQuestionnaireRaw,
  normalizeQuestionnaire,
} from "@/lib/didit/questionnaires";
import { fromDidit } from "@/lib/forms/convert";
import { resolveText } from "@/lib/forms/definition";

async function createFormFromDidit(
  sourceRef: string,
  definition: ReturnType<typeof fromDidit>,
) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      name: resolveText(definition.title, "es") || "Formulario DIDIT",
      status: "draft",
      source: "didit",
      source_ref: sourceRef,
      definition,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Importa un workflow completo de DIDIT como formulario editable. */
export async function importWorkflow(uuid: string) {
  await requireAnalyst();
  const form = await assembleWorkflow(uuid);
  const id = await createFormFromDidit(uuid, fromDidit(form));
  redirect(`/admin/forms/${id}/edit`);
}

/** Importa un questionnaire suelto de DIDIT como formulario editable. */
export async function importQuestionnaire(uuid: string) {
  await requireAnalyst();
  const raw = await retrieveQuestionnaireRaw(uuid);
  const id = await createFormFromDidit(uuid, fromDidit(normalizeQuestionnaire(raw)));
  redirect(`/admin/forms/${id}/edit`);
}

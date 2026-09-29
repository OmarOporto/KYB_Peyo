"use server";

import { redirect } from "next/navigation";
import { requireAnalyst } from "@/lib/auth/admin";
import { creationOrg } from "@/lib/auth/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assembleWorkflow,
  retrieveQuestionnaireRaw,
  normalizeQuestionnaire,
} from "@/lib/didit/questionnaires";
import { fromDidit } from "@/lib/forms/convert";
import { resolveText } from "@/lib/forms/definition";

/**
 * El catálogo de DIDIT es uno solo (la cuenta de la plataforma) y lo ven todas
 * las orgs; lo que se importa, en cambio, queda como formulario de la org de
 * quien importa. El admin puede elegir la org con el campo `org`.
 */
async function createFormFromDidit(
  orgId: string,
  sourceRef: string,
  definition: ReturnType<typeof fromDidit>,
) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      org_id: orgId,
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

async function importOrg(formData?: FormData): Promise<string> {
  const analyst = await requireAnalyst();
  const org = await creationOrg(analyst, formData?.get("org")?.toString());
  if (!org) throw new Error("Organización inválida.");
  return org;
}

/** Importa un workflow completo de DIDIT como formulario editable. */
export async function importWorkflow(uuid: string, formData?: FormData) {
  const org = await importOrg(formData);
  const form = await assembleWorkflow(uuid);
  const id = await createFormFromDidit(org, uuid, fromDidit(form));
  redirect(`/admin/forms/${id}/edit`);
}

/** Importa un questionnaire suelto de DIDIT como formulario editable. */
export async function importQuestionnaire(uuid: string, formData?: FormData) {
  const org = await importOrg(formData);
  const raw = await retrieveQuestionnaireRaw(uuid);
  const id = await createFormFromDidit(org, uuid, fromDidit(normalizeQuestionnaire(raw)));
  redirect(`/admin/forms/${id}/edit`);
}

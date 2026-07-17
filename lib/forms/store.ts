import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { formDefinitionSchema, type FormDefinition } from "./definition";

export interface FormRow {
  id: string;
  name: string;
  status: "draft" | "published";
  definition: FormDefinition;
  source: string;
  source_ref: string | null;
  updated_at: string;
}

/** Formulario PUBLICADO por id (para la ruta pública /forms/[id]). */
export async function getPublishedForm(id: string): Promise<FormRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("forms")
    .select("id, name, status, definition, source, source_ref, updated_at")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  return validate(data);
}

/** Formulario por id (para el solicitante; la solicitud ya lo referenció). */
export async function getFormById(id: string): Promise<FormRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("forms")
    .select("id, name, status, definition, source, source_ref, updated_at")
    .eq("id", id)
    .maybeSingle();
  return validate(data);
}

/** Resuelve el formulario para una solicitud: su form_id, o el publicado por defecto. */
export async function getFormForRequest(
  formId: string | null | undefined,
): Promise<FormRow | null> {
  if (formId) {
    const byId = await getFormById(formId);
    if (byId) return byId;
  }
  return getDefaultPublishedForm();
}

/**
 * Definición contra la que operar una solicitud: prioriza el snapshot congelado
 * en la solicitud (lo que el solicitante realmente llenó) y, si no existe o es
 * inválido (solicitudes viejas / creadas por API), cae al form vigente por id.
 */
export async function resolveRequestDefinition(
  snapshot: unknown,
  formId: string | null | undefined,
): Promise<FormDefinition | null> {
  const parsed = formDefinitionSchema.safeParse(snapshot);
  if (parsed.success) return parsed.data;
  const form = await getFormForRequest(formId);
  return form?.definition ?? null;
}

/** Formulario publicado por defecto: el más reciente. */
export async function getDefaultPublishedForm(): Promise<FormRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("forms")
    .select("id, name, status, definition, source, source_ref, updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return validate(data);
}

function validate(data: unknown): FormRow | null {
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const parsed = formDefinitionSchema.safeParse(row.definition);
  if (!parsed.success) return null;
  return { ...(row as unknown as FormRow), definition: parsed.data };
}

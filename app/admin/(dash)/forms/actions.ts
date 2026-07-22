"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  emptyForm,
  formDefinitionSchema,
  resolveText,
} from "@/lib/forms/definition";
import { isGoogleFormExport, fromGoogleForm } from "@/lib/forms/import-google";

type Result = { ok: true; id?: string } | { ok: false; error: string };

const FORM_ASSETS_BUCKET = "form-assets";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function createForm() {
  await requireAnalyst();
  const def = emptyForm();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      name: resolveText(def.title, "es") || "Nuevo formulario",
      status: "draft",
      source: "manual",
      definition: def,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/admin/forms/${data.id}/edit`);
}

export async function saveForm(
  id: string,
  payload: { name: string; definition: unknown },
): Promise<Result> {
  await requireAnalyst();
  const parsed = formDefinitionSchema.safeParse(payload.definition);
  if (!parsed.success) {
    return { ok: false, error: "La definición del formulario no es válida." };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("forms")
    .update({
      name: payload.name?.trim() || "Formulario",
      definition: parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/${id}/edit`);
  return { ok: true };
}

export async function setFormStatus(
  id: string,
  status: "draft" | "published",
): Promise<Result> {
  await requireAnalyst();
  const supabase = createServiceClient();
  // Al publicar, validar que la definición guardada sea correcta.
  if (status === "published") {
    const { data } = await supabase
      .from("forms")
      .select("definition")
      .eq("id", id)
      .maybeSingle();
    if (!formDefinitionSchema.safeParse(data?.definition).success) {
      return { ok: false, error: "El formulario no es válido para publicar." };
    }
  }
  const { error } = await supabase
    .from("forms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/forms");
  revalidatePath(`/admin/forms/${id}/edit`);
  return { ok: true };
}

export async function duplicateForm(id: string) {
  await requireAnalyst();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("forms")
    .select("name, source, source_ref, definition")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    throw new Error(error?.message ?? "Formulario no encontrado.");
  }
  const parsed = formDefinitionSchema.safeParse(data.definition);
  if (!parsed.success) {
    throw new Error("La definición del formulario no es válida.");
  }
  const { data: created, error: insertError } = await supabase
    .from("forms")
    .insert({
      name: `${data.name} (copia)`,
      status: "draft",
      source: data.source,
      source_ref: data.source_ref,
      definition: parsed.data,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);
  revalidatePath("/admin/forms");
  redirect(`/admin/forms/${created.id}/edit`);
}

export async function deleteForm(id: string) {
  await requireAnalyst();
  const supabase = createServiceClient();
  const { error } = await supabase.from("forms").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/forms");
  redirect("/admin/forms");
}

export async function importFormJson(json: string): Promise<Result> {
  await requireAnalyst();
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON inválido." };
  }

  // Auto-detección: nuestro FormDefinition, o export de Google Forms.
  let parsed = formDefinitionSchema.safeParse(raw);
  if (!parsed.success && isGoogleFormExport(raw)) {
    parsed = formDefinitionSchema.safeParse(fromGoogleForm(raw));
    if (!parsed.success) {
      return { ok: false, error: "No se pudo convertir el formulario de Google Forms." };
    }
  }
  if (!parsed.success) {
    return {
      ok: false,
      error: "Formato no reconocido: usa nuestro JSON de formulario o un export de Google Forms.",
    };
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({
      name: resolveText(parsed.data.title, "es") || "Formulario importado",
      status: "draft",
      source: "manual",
      definition: parsed.data,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  redirect(`/admin/forms/${data.id}/edit`);
}

/**
 * Sube una imagen de ayuda (pregunta/opción) al bucket público `form-assets`
 * y devuelve su URL pública. Solo analistas.
 */
export async function uploadFormImageAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAnalyst();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "invalid" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "type" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "size" };
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `help/${randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(FORM_ASSETS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "image/*",
      upsert: false,
    });
  if (error) return { ok: false, error: error.message };

  const { data } = supabase.storage.from(FORM_ASSETS_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

"use server";

import { randomUUID } from "crypto";
import {
  getRequestByToken,
  saveDraft,
  submitRequest,
  recordDocument,
  deleteDocument,
  isTerminal,
  DOCUMENTS_BUCKET,
} from "@/lib/kyb/service";
import { createServiceClient } from "@/lib/supabase/service";
import { kybSubmitSchema } from "@/lib/forms/schema";
import { getFormForRequest } from "@/lib/forms/store";
import { allVisibleFields } from "@/lib/forms/logic";
import { buildZod } from "@/lib/forms/validation";

type ActionResult = { ok: true } | { ok: false; error: string };

type Resolved =
  | { ok: false; error: string }
  | { ok: true; req: Awaited<ReturnType<typeof getRequestByToken>> & object };

async function resolveOpen(token: string): Promise<Resolved> {
  const req = await getRequestByToken(token);
  if (!req) return { ok: false, error: "Invitación inválida." };
  if (req.status === "expired")
    return { ok: false, error: "La invitación expiró." };
  if (isTerminal(req.status))
    return { ok: false, error: "La solicitud ya fue enviada." };
  return { ok: true, req };
}

/** Autosave del borrador. */
export async function saveDraftAction(
  token: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  const r = await resolveOpen(token);
  if (!r.ok) return { ok: false, error: r.error };
  try {
    await saveDraft(r.req.id, data);
    return { ok: true };
  } catch (e) {
    console.error("[saveDraftAction] falló", e);
    return { ok: false, error: "No se pudo guardar el borrador." };
  }
}

/** Sube un documento a Storage (gated por token) y guarda sus metadatos. */
export async function uploadDocumentAction(
  formData: FormData,
): Promise<ActionResult & { path?: string; filename?: string }> {
  const token = String(formData.get("token") ?? "");
  const docType = String(formData.get("docType") ?? "general");
  const file = formData.get("file");

  const r = await resolveOpen(token);
  if (!r.ok) return { ok: false, error: r.error };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Archivo inválido." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "El archivo supera 15 MB." };
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${r.req.id}/${docType}/${randomUUID()}-${safeName}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = createServiceClient();
    const { error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (error) return { ok: false, error: error.message };

    await recordDocument({
      requestId: r.req.id,
      docType,
      storagePath: path,
      filename: file.name,
      mime: file.type || null,
      size: file.size,
    });

    return { ok: true, path, filename: file.name };
  } catch (e) {
    console.error("[uploadDocumentAction] falló", e);
    return { ok: false, error: "No se pudo subir el archivo." };
  }
}

/** Elimina un documento ya subido (gated por token). */
export async function deleteDocumentAction(
  token: string,
  storagePath: string,
): Promise<ActionResult> {
  const r = await resolveOpen(token);
  if (!r.ok) return { ok: false, error: r.error };
  // Solo se pueden borrar archivos que pertenecen a esta solicitud.
  if (!storagePath || !storagePath.startsWith(`${r.req.id}/`)) {
    return { ok: false, error: "Documento inválido." };
  }
  try {
    await deleteDocument({ requestId: r.req.id, storagePath });
    return { ok: true };
  } catch (e) {
    console.error("[deleteDocumentAction] falló", e);
    return { ok: false, error: "No se pudo eliminar el documento." };
  }
}

/** Envía el formulario final (valida el esquema completo). */
export async function submitAction(
  token: string,
  data: Record<string, unknown>,
): Promise<ActionResult> {
  const r = await resolveOpen(token);
  if (!r.ok) return { ok: false, error: r.error };

  const parsed = kybSubmitSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Faltan campos requeridos o hay valores inválidos.",
    };
  }

  try {
    await submitRequest(r.req.id, parsed.data);
    return { ok: true };
  } catch (e) {
    console.error("[submitAction] falló", e);
    return { ok: false, error: "No se pudo enviar el formulario. Intenta de nuevo." };
  }
}

/** Envío del formulario dinámico (valida contra la definición asignada). */
export async function submitFormAction(
  token: string,
  answers: Record<string, unknown>,
): Promise<ActionResult> {
  const r = await resolveOpen(token);
  if (!r.ok) return { ok: false, error: r.error };

  const formId = (r.req as { form_id?: string | null }).form_id ?? null;
  const form = await getFormForRequest(formId);
  if (form) {
    const schema = buildZod(allVisibleFields(form.definition, answers));
    if (!schema.safeParse(answers).success) {
      return { ok: false, error: "Faltan campos requeridos o hay valores inválidos." };
    }
  }

  try {
    await submitRequest(r.req.id, answers);
    return { ok: true };
  } catch (e) {
    console.error("[submitFormAction] falló", e);
    return { ok: false, error: "No se pudo enviar el formulario. Intenta de nuevo." };
  }
}

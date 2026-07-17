"use server";

import { randomUUID } from "crypto";
import { after } from "next/server";
import {
  getRequestByToken,
  saveDraft,
  submitRequest,
  runVerifications,
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
  if (!r.ok) {
    console.warn("[uploadDocumentAction] solicitud no abierta:", r.error);
    return { ok: false, error: r.error };
  }
  if (!(file instanceof File) || file.size === 0) {
    console.warn("[uploadDocumentAction] archivo inválido o vacío", {
      isFile: file instanceof File,
      size: file instanceof File ? file.size : null,
    });
    return { ok: false, error: "Archivo inválido." };
  }
  if (file.size > 15 * 1024 * 1024) {
    console.warn("[uploadDocumentAction] archivo supera 15 MB:", file.size);
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
    if (error) {
      console.error(
        `[uploadDocumentAction] storage falló (bucket "${DOCUMENTS_BUCKET}", path "${path}"):`,
        error.message,
      );
      return { ok: false, error: error.message };
    }

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

/**
 * Crea una signed upload URL para subir un archivo DIRECTO a Storage desde el
 * navegador (sin el doble salto por el Server Action). El server arma el path
 * scoped a la solicitud; el cliente no puede inyectarlo.
 */
export async function createUploadUrlAction(
  token: string,
  docType: string,
  filename: string,
): Promise<ActionResult & { path?: string; uploadToken?: string }> {
  const r = await resolveOpen(token);
  if (!r.ok) return { ok: false, error: r.error };

  const safeName = (filename || "archivo").replace(/[^\w.\-]+/g, "_");
  const path = `${r.req.id}/${docType || "general"}/${randomUUID()}-${safeName}`;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[createUploadUrlAction] falló:", error?.message);
      return { ok: false, error: error?.message ?? "No se pudo preparar la subida." };
    }
    return { ok: true, path: data.path, uploadToken: data.token };
  } catch (e) {
    console.error("[createUploadUrlAction] falló", e);
    return { ok: false, error: "No se pudo preparar la subida." };
  }
}

/**
 * Registra los metadatos de un archivo ya subido vía signed URL (gated por
 * token). Valida que el path pertenezca a esta solicitud.
 */
export async function confirmUploadAction(input: {
  token: string;
  path: string;
  docType: string;
  filename: string;
  mime?: string | null;
  size?: number | null;
}): Promise<ActionResult> {
  const r = await resolveOpen(input.token);
  if (!r.ok) return { ok: false, error: r.error };
  if (!input.path || !input.path.startsWith(`${r.req.id}/`)) {
    return { ok: false, error: "Ruta inválida." };
  }
  try {
    await recordDocument({
      requestId: r.req.id,
      docType: input.docType || "general",
      storagePath: input.path,
      filename: input.filename,
      mime: input.mime ?? null,
      size: input.size ?? null,
    });
    return { ok: true };
  } catch (e) {
    console.error("[confirmUploadAction] falló", e);
    return { ok: false, error: "No se pudo registrar el archivo." };
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
    // Las verificaciones (DIDIT/AML) corren en segundo plano para no bloquear
    // la respuesta; el admin lee los checks en vivo cuando estén listos.
    after(() => runVerifications(r.req.id));
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
    // Verificaciones DIDIT/AML en segundo plano (ver submitAction).
    after(() => runVerifications(r.req.id));
    return { ok: true };
  } catch (e) {
    console.error("[submitFormAction] falló", e);
    return { ok: false, error: "No se pudo enviar el formulario. Intenta de nuevo." };
  }
}

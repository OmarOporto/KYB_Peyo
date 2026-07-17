"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { createRequest } from "@/lib/kyb/service";
import { getPublishedForm } from "@/lib/forms/store";

/**
 * Intake público: crea una solicitud real para un formulario PUBLICADO y
 * redirige al flujo por token (`/f/[token]`), que ya maneja autosave, subida
 * de archivos, submit y persistencia. Así el enlace público `/forms/[id]`
 * recolecta respuestas de verdad en vez de ser solo vista previa.
 */
export async function startPublicIntake(
  formId: string,
): Promise<{ ok: false; error: string }> {
  // Solo formularios publicados pueden recibir intake público.
  const form = await getPublishedForm(formId);
  if (!form) {
    return { ok: false, error: "Este formulario no está disponible." };
  }

  let token: string;
  try {
    // external_ref distintivo para que admin identifique los intakes públicos.
    const externalRef = `public:${randomUUID().slice(0, 8)}`;
    const created = await createRequest(externalRef, undefined, formId, form.definition);
    token = created.token;
  } catch (e) {
    console.error("[startPublicIntake] falló", e);
    return { ok: false, error: "No se pudo iniciar la solicitud. Intenta de nuevo." };
  }

  // redirect() debe ir fuera del try/catch (lanza NEXT_REDIRECT internamente).
  redirect(`/f/${token}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAnalyst } from "@/lib/auth/admin";
import {
  decideRequest,
  requestChanges,
  runVerifications,
  DOCUMENTS_BUCKET,
} from "@/lib/kyb/service";
import { notifyClient } from "@/lib/kyb/webhook";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabase } from "@/lib/supabase/server";
import type { KybDecision } from "@/lib/kyb/types";

export async function decideAction(
  requestId: string,
  decision: KybDecision,
  formData?: FormData,
) {
  const analyst = await requireAnalyst();
  const reason = formData ? String(formData.get("reason") ?? "") : undefined;
  await decideRequest(
    requestId,
    decision,
    { userId: analyst.userId, email: analyst.email },
    reason,
  );
  // Push al cliente en segundo plano (no bloquea la respuesta del panel).
  after(() => notifyClient(requestId, "decision.made"));
  revalidatePath(`/admin/requests/${requestId}`);
  revalidatePath("/admin");
}

/**
 * Devuelve la solicitud al solicitante para corregir preguntas puntuales
 * (borra sus respuestas y re-emite el link). Llamado desde el panel de detalle.
 */
export async function requestChangesAction(
  requestId: string,
  fields: { key: string; note?: string }[],
): Promise<
  | { ok: true; invitationUrl: string; round: number }
  | { ok: false; error: string }
> {
  const analyst = await requireAnalyst();
  const res = await requestChanges(requestId, fields, {
    actor: analyst.email,
    source: "admin",
  });
  if (!res.ok) return res;
  after(() => notifyClient(requestId, "changes.requested"));
  revalidatePath(`/admin/requests/${requestId}`);
  revalidatePath("/admin");
  return { ok: true, invitationUrl: res.invitationUrl, round: res.round };
}

/**
 * Re-corre las verificaciones DIDIT/AML de una solicitud (recuperación cuando el
 * trabajo en segundo plano quedó a medias). Es reanudable/idempotente: no re-hace
 * las verificaciones ya exitosas.
 */
export async function rerunVerificationsAction(requestId: string) {
  await requireAnalyst();
  await runVerifications(requestId, { force: true });
  revalidatePath(`/admin/requests/${requestId}`);
}

/** URL firmada temporal para descargar un documento (solo analistas). */
export async function getDocUrlAction(path: string): Promise<string | null> {
  await requireAnalyst();
  const supabase = createServiceClient();
  const { data } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

export async function signOutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

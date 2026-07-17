"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnalyst } from "@/lib/auth/admin";
import { decideRequest, runVerifications, DOCUMENTS_BUCKET } from "@/lib/kyb/service";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabase } from "@/lib/supabase/server";
import type { KybDecision } from "@/lib/kyb/types";

export async function decideAction(requestId: string, decision: KybDecision) {
  const analyst = await requireAnalyst();
  await decideRequest(requestId, decision, {
    userId: analyst.userId,
    email: analyst.email,
  });
  revalidatePath(`/admin/requests/${requestId}`);
  revalidatePath("/admin");
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

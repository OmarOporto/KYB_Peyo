"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";

export async function deleteTemplate(id: string) {
  await requireAnalyst();
  const supabase = createServiceClient();
  const { error } = await supabase.from("form_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/templates");
  redirect("/admin/templates");
}

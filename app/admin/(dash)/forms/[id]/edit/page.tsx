import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  formDefinitionSchema,
  emptyForm,
  type FormStatus,
} from "@/lib/forms/definition";
import { FormBuilder } from "./FormBuilder";

export const dynamic = "force-dynamic";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("forms");
  const supabase = await createServerSupabase();
  const [{ data: form }, admin] = await Promise.all([
    supabase
      .from("forms")
      .select("id, name, status, definition")
      .eq("id", id)
      .maybeSingle(),
    isAdmin(),
  ]);
  if (!form) notFound();

  const parsed = formDefinitionSchema.safeParse(form.definition);
  const definition = parsed.success ? parsed.data : emptyForm();

  return (
    <div>
      <div className="mx-auto max-w-5xl px-6 pt-4">
        <Link href="/admin/forms" className="text-sm text-brand hover:underline">
          ← {t("title")}
        </Link>
      </div>
      <FormBuilder
        id={form.id}
        initialName={form.name}
        initialStatus={form.status as FormStatus}
        initialDef={definition}
        isAdmin={admin}
      />
    </div>
  );
}

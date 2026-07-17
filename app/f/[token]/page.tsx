import { getLocale, getTranslations } from "next-intl/server";
import { getRequestByToken } from "@/lib/kyb/service";
import { createServiceClient } from "@/lib/supabase/service";
import { getFormForRequest } from "@/lib/forms/store";
import { emptyForm } from "@/lib/forms/schema";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
import { ApplicantForm } from "./ApplicantForm";
import KybForm from "./KybForm";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center p-8">
        <Card className="w-full p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {title}
          </h1>
          <p className="mt-2 text-muted">{body}</p>
        </Card>
      </main>
    </>
  );
}

export default async function FormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("form");
  const req = await getRequestByToken(token);

  if (!req) {
    return <Notice title={t("invalidTitle")} body={t("invalidBody")} />;
  }
  if (req.status === "expired") {
    return <Notice title={t("expiredTitle")} body={t("expiredBody")} />;
  }
  if (["submitted", "under_review", "approved", "rejected"].includes(req.status)) {
    return <Notice title={t("receivedTitle")} body={t("receivedBody")} />;
  }

  const supabase = createServiceClient();
  const [{ data: draftRow }, { data: docs }] = await Promise.all([
    supabase
      .from("kyb_form_responses")
      .select("data")
      .eq("request_id", req.id)
      .maybeSingle(),
    supabase
      .from("kyb_documents")
      .select("id, doc_type, filename, uploaded_at, storage_path")
      .eq("request_id", req.id)
      .order("uploaded_at", { ascending: true }),
  ]);

  const savedData = (draftRow?.data as Record<string, unknown>) ?? {};

  // Formulario dinámico si hay uno asignado/publicado; si no, fallback al legacy.
  const form = await getFormForRequest(
    (req as { form_id?: string | null }).form_id,
  );
  if (form) {
    const locale = await getLocale();
    return (
      <>
        <AppHeader />
        <main className="mx-auto w-full max-w-2xl flex-1 p-6">
          <ApplicantForm
            token={token}
            definition={form.definition}
            locale={locale}
            initialAnswers={savedData}
          />
        </main>
      </>
    );
  }

  return (
    <KybForm
      token={token}
      initialData={{ ...emptyForm, ...savedData }}
      initialDocs={(docs ?? []).map((d) => ({
        id: d.id,
        doc_type: d.doc_type,
        filename: d.filename,
        uploaded_at: d.uploaded_at,
        storagePath: d.storage_path ?? "",
      }))}
    />
  );
}

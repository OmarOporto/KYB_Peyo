import { getTranslations } from "next-intl/server";
import { getRequestByToken } from "@/lib/kyb/service";
import { createServiceClient } from "@/lib/supabase/service";
import { emptyForm } from "@/lib/forms/schema";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/Card";
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
      .select("id, doc_type, filename, uploaded_at")
      .eq("request_id", req.id)
      .order("uploaded_at", { ascending: true }),
  ]);

  const draft = {
    ...emptyForm,
    ...((draftRow?.data as Record<string, unknown>) ?? {}),
  };

  return (
    <KybForm
      token={token}
      initialData={draft}
      initialDocs={docs ?? []}
    />
  );
}

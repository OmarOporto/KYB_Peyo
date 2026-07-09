import { getRequestByToken } from "@/lib/kyb/service";
import { createServiceClient } from "@/lib/supabase/service";
import { emptyForm } from "@/lib/forms/schema";
import KybForm from "./KybForm";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-gray-500">{body}</p>
    </main>
  );
}

export default async function FormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const req = await getRequestByToken(token);

  if (!req) {
    return (
      <Notice
        title="Invitación inválida"
        body="El enlace no es válido. Verifica con quien te lo compartió."
      />
    );
  }
  if (req.status === "expired") {
    return (
      <Notice
        title="Invitación expirada"
        body="Este enlace ya no está disponible. Solicita uno nuevo."
      />
    );
  }
  if (["submitted", "under_review", "approved", "rejected"].includes(req.status)) {
    return (
      <Notice
        title="Formulario recibido"
        body="Tu información ya fue enviada y está en revisión. ¡Gracias!"
      />
    );
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

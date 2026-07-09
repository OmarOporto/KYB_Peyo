import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { StatusBadge } from "../../StatusBadge";
import { DocLink } from "../../DocLink";
import { decideAction } from "../../actions";
import { isTerminal } from "@/lib/kyb/service";
import type { KybStatus } from "@/lib/kyb/types";

export const dynamic = "force-dynamic";

export default async function RequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAnalyst();
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: request } = await supabase
    .from("kyb_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  const [{ data: formRow }, { data: docs }, { data: aml }] = await Promise.all([
    supabase.from("kyb_form_responses").select("data").eq("request_id", id).maybeSingle(),
    supabase
      .from("kyb_documents")
      .select("id, doc_type, filename, storage_path, uploaded_at")
      .eq("request_id", id),
    supabase
      .from("aml_checks")
      .select("provider, status, result, created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const formData = (formRow?.data as Record<string, unknown>) ?? {};
  const closed = isTerminal(request.status as KybStatus);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/admin" className="text-sm text-blue-600 hover:underline">
        ← Volver
      </Link>

      <header className="mt-3 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{request.external_ref}</h1>
          <p className="text-sm text-gray-500">ID: {request.id}</p>
        </div>
        <StatusBadge status={request.status} />
      </header>

      {/* AML */}
      <Section title="Resultado AML (DIDIT)">
        {(aml ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Sin checks todavía.</p>
        )}
        {(aml ?? []).map((c, i) => (
          <div key={i} className="mb-2 rounded border border-gray-200 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium">{c.provider}</span>
              <StatusBadge status={amlToBadge(c.status)} />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-600">
              {JSON.stringify(c.result, null, 2)}
            </pre>
          </div>
        ))}
      </Section>

      {/* Documentos */}
      <Section title="Documentos">
        {(docs ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Sin documentos.</p>
        )}
        <ul className="space-y-1 text-sm">
          {(docs ?? []).map((d) => (
            <li key={d.id}>
              <DocLink path={d.storage_path} filename={d.filename} />{" "}
              <span className="text-gray-400">({d.doc_type})</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Formulario */}
      <Section title="Formulario">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {Object.entries(formData).map(([k, v]) => (
            <div key={k} className="border-b border-gray-100 pb-1">
              <dt className="text-gray-400">{k}</dt>
              <dd className="break-words">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* Decisión */}
      {!closed && (
        <div className="mt-6 flex gap-3">
          <form action={decideAction.bind(null, id, "approved")}>
            <button className="rounded bg-green-600 px-5 py-2 text-sm font-medium text-white">
              Aprobar
            </button>
          </form>
          <form action={decideAction.bind(null, id, "rejected")}>
            <button className="rounded bg-red-600 px-5 py-2 text-sm font-medium text-white">
              Rechazar
            </button>
          </form>
        </div>
      )}
      {closed && (
        <p className="mt-6 text-sm text-gray-500">
          Decisión: <strong>{request.decision ?? request.status}</strong>
        </p>
      )}
    </main>
  );
}

function amlToBadge(status: string): string {
  return status === "passed"
    ? "approved"
    : status === "flagged"
      ? "rejected"
      : status === "error"
        ? "expired"
        : "under_review";
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

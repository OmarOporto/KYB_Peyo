import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DocLink } from "@/components/admin/DocLink";
import { decideAction } from "@/app/admin/actions";
import { isTerminal } from "@/lib/kyb/service";
import type { KybStatus } from "@/lib/kyb/types";
import { getFormForRequest } from "@/lib/forms/store";
import { resolveText } from "@/lib/forms/definition";
import { renderAnswer } from "@/lib/forms/answers";

export const dynamic = "force-dynamic";

export default async function RequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("admin");
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
  const locale = await getLocale();
  const form = await getFormForRequest(
    (request as { form_id?: string | null }).form_id,
  );

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← {t("back")}
      </Link>

      <header className="mt-3 mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {request.external_ref}
          </h1>
          <p className="text-sm text-muted">ID: {request.id}</p>
        </div>
        <StatusBadge status={request.status} />
      </header>

      {/* AML */}
      <Section title={t("amlResult")}>
        {(aml ?? []).length === 0 && (
          <p className="text-sm text-muted">{t("noChecks")}</p>
        )}
        {(aml ?? []).map((c, i) => (
          <Card key={i} className="mb-2 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium text-foreground">{c.provider}</span>
              <StatusBadge status={amlToBadge(c.status)} />
            </div>
            <pre className="overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs whitespace-pre-wrap break-words text-muted">
              {JSON.stringify(c.result, null, 2)}
            </pre>
          </Card>
        ))}
      </Section>

      {/* Documentos */}
      <Section title={t("documents")}>
        {(docs ?? []).length === 0 && (
          <p className="text-sm text-muted">{t("noDocuments")}</p>
        )}
        <ul className="space-y-1 text-sm">
          {(docs ?? []).map((d) => (
            <li key={d.id}>
              <DocLink path={d.storage_path} filename={d.filename} />{" "}
              <span className="text-muted">({d.doc_type})</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Formulario */}
      <Section title={t("form")}>
        {form ? (
          <div className="space-y-4">
            {form.definition.sections.map((s, si) => {
              const fields = s.fields.filter((f) => f.type !== "note");
              if (fields.length === 0) return null;
              return (
                <Card key={si} className="p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    {resolveText(s.title, locale)}
                  </h3>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {fields.map((f) => (
                      <div key={f.id} className="border-b border-border pb-1">
                        <dt className="text-muted">
                          {resolveText(f.label, locale) || f.key}
                        </dt>
                        <dd className="break-words text-foreground">
                          {renderAnswer(f, formData[f.key], locale)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {Object.entries(formData).map(([k, v]) => (
                <div key={k} className="border-b border-border pb-1">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-words text-foreground">
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </Section>

      {/* Decisión */}
      {!closed && (
        <div className="mt-6 flex gap-3">
          <form action={decideAction.bind(null, id, "approved")}>
            <Button variant="success">{t("approve")}</Button>
          </form>
          <form action={decideAction.bind(null, id, "rejected")}>
            <Button variant="danger">{t("reject")}</Button>
          </form>
        </div>
      )}
      {closed && (
        <p className="mt-6 text-sm text-muted">
          {t("decision")}:{" "}
          <strong className="text-foreground">
            {request.decision ?? request.status}
          </strong>
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
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

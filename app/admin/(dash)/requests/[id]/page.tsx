import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DocPreview } from "@/components/admin/DocPreview";
import { decideAction } from "@/app/admin/actions";
import { isTerminal, createSignedDocUrls } from "@/lib/kyb/service";
import type { KybStatus } from "@/lib/kyb/types";
import { getFormForRequest } from "@/lib/forms/store";
import { resolveText, type Field } from "@/lib/forms/definition";
import { renderAnswer } from "@/lib/forms/answers";

export const dynamic = "force-dynamic";

export default async function RequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("admin");
  const tB = await getTranslations("builder");
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
      .select("id, doc_type, filename, storage_path, mime, uploaded_at")
      .eq("request_id", id),
    supabase
      .from("aml_checks")
      .select("provider, status, result, created_at, feature, field_key, score")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const formData = (formRow?.data as Record<string, unknown>) ?? {};
  const closed = isTerminal(request.status as KybStatus);
  const locale = await getLocale();
  const form = await getFormForRequest(
    (request as { form_id?: string | null }).form_id,
  );

  // Firma una sola vez las URLs de todos los archivos (documentos + campos
  // file/selfie del formulario) para mostrar miniaturas inline.
  const answerRefs = form
    ? form.definition.sections.flatMap((s) =>
        s.fields
          .filter((f) => f.type === "file" || f.type === "selfie")
          .flatMap((f) => fileRefsOf(formData[f.key])),
      )
    : [];
  const signedUrls = await createSignedDocUrls([
    ...(docs ?? []).map((d) => d.storage_path),
    ...answerRefs.map((r) => r.path),
  ]);

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
        {(aml ?? []).map((c, i) => {
          const featureKey = c.feature ? `didit_${c.feature}` : null;
          const title =
            featureKey && tB.has(featureKey) ? tB(featureKey) : t("amlResult");
          return (
            <Card key={i} className="mb-2 p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{title}</span>
                <StatusBadge status={amlToBadge(c.status)} />
                {typeof c.score === "number" && (
                  <span className="text-xs text-muted">
                    {t("score")}: {c.score.toFixed(2)}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">{c.provider}</span>
              </div>
              <AmlSummary result={c.result} emptyLabel={t("noAmlDetails")} />
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                  {t("rawResponse")}
                </summary>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs whitespace-pre-wrap break-words text-muted">
                  {JSON.stringify(c.result, null, 2)}
                </pre>
              </details>
            </Card>
          );
        })}
      </Section>

      {/* Documentos */}
      <Section title={t("documents")}>
        {(docs ?? []).length === 0 && (
          <p className="text-sm text-muted">{t("noDocuments")}</p>
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          {(docs ?? []).map((d) => (
            <div key={d.id}>
              <DocPreview
                path={d.storage_path}
                filename={d.filename}
                url={signedUrls[d.storage_path]}
                mime={d.mime}
              />
              <p className="mt-1 text-xs text-muted">{d.doc_type}</p>
            </div>
          ))}
        </div>
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
                          <AnswerValue
                            field={f}
                            value={formData[f.key]}
                            locale={locale}
                            signedUrls={signedUrls}
                          />
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

/** Extrae los FileRef ({path, filename}) del valor de un campo file/selfie. */
function fileRefsOf(value: unknown): { path: string; filename: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) =>
    r && typeof r === "object" && "path" in r
      ? [
          {
            path: String((r as { path: unknown }).path),
            filename:
              "filename" in r
                ? String((r as { filename: unknown }).filename)
                : "archivo",
          },
        ]
      : [],
  );
}

/** Renderiza la respuesta de un campo: miniaturas para file/selfie, texto para el resto. */
function AnswerValue({
  field,
  value,
  locale,
  signedUrls,
}: {
  field: Field;
  value: unknown;
  locale: string;
  signedUrls: Record<string, string>;
}) {
  if (field.type === "file" || field.type === "selfie") {
    const refs = fileRefsOf(value);
    if (refs.length === 0) return <>—</>;
    return (
      <div className="mt-1 flex flex-wrap gap-2">
        {refs.map((r, i) => (
          <DocPreview
            key={i}
            path={r.path}
            filename={r.filename}
            url={signedUrls[r.path]}
          />
        ))}
      </div>
    );
  }
  return <>{renderAnswer(field, value, locale)}</>;
}

/** Resumen legible del `result` de un check (clave/valor), con el JSON crudo aparte. */
function AmlSummary({ result, emptyLabel }: { result: unknown; emptyLabel: string }) {
  if (!result || typeof result !== "object") {
    return <p className="text-xs text-muted">{emptyLabel}</p>;
  }
  const entries = Object.entries(result as Record<string, unknown>).filter(
    ([k]) => k !== "provider", // el proveedor ya se muestra en el encabezado
  );
  if (entries.length === 0) {
    return <p className="text-xs text-muted">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="shrink-0 text-muted">{k}</span>
          <span className="min-w-0 break-words text-foreground">{formatVal(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** Formatea un valor del `result` para el resumen (los detalles anidados van al JSON crudo). */
function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    return v.every((x) => typeof x !== "object")
      ? v.map(String).join(", ")
      : String(v.length);
  }
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "✓" : "✗";
  return String(v);
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

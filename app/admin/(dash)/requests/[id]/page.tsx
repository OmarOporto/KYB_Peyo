import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DocPreview } from "@/components/admin/DocPreview";
import {
  AmlCheckCard,
  type AmlCheckRow,
  type CheckImage,
} from "@/components/admin/AmlCheckCard";
import { decideAction, rerunVerificationsAction } from "@/app/admin/actions";
import { isTerminal, createSignedDocUrls } from "@/lib/kyb/service";
import type { KybStatus } from "@/lib/kyb/types";
import { resolveRequestDefinition } from "@/lib/forms/store";
import { isAnswered } from "@/lib/forms/logic";
import { resolveText, type Field } from "@/lib/forms/definition";
import { renderAnswer, fileRefsOf } from "@/lib/forms/answers";

export const dynamic = "force-dynamic";

export default async function RequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("admin");
  const tCommon = await getTranslations("common");
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
  // Definición congelada del request (lo que el solicitante realmente llenó).
  const definition = await resolveRequestDefinition(
    (request as { form_definition?: unknown }).form_definition,
    (request as { form_id?: string | null }).form_id,
  );

  // Firma una sola vez las URLs de todos los archivos (documentos + campos
  // file/selfie del formulario) para mostrar miniaturas inline.
  const answerRefs = definition
    ? definition.sections.flatMap((s) =>
        s.fields
          .filter((f) => f.type === "file" || f.type === "selfie")
          .flatMap((f) => fileRefsOf(formData[f.key])),
      )
    : [];
  const signedUrls = await createSignedDocUrls([
    ...(docs ?? []).map((d) => d.storage_path),
    ...answerRefs.map((r) => r.path),
  ]);

  // Campo por key (imágenes de referencia) y origen (sección/pregunta) por key.
  const fieldByKey = new Map<string, Field>();
  const triggerByKey = new Map<string, { section: string; question: string }>();
  if (definition) {
    for (const s of definition.sections) {
      const sectionTitle = resolveText(s.title, locale);
      for (const f of s.fields) {
        fieldByKey.set(f.key, f);
        triggerByKey.set(f.key, {
          section: sectionTitle,
          question: resolveText(f.label, locale) || f.key,
        });
      }
    }
  }
  const imageForKey = (key: string): CheckImage | undefined => {
    const ref = fileRefsOf(formData[key])[0];
    return ref
      ? { filename: ref.filename, path: ref.path, url: signedUrls[ref.path] }
      : undefined;
  };

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← {tCommon("back")}
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
        <form action={rerunVerificationsAction.bind(null, id)} className="mb-2">
          <Button type="submit" variant="outline" size="sm">
            {t("reverify")}
          </Button>
        </form>
        {(aml ?? []).length === 0 && (
          <p className="text-sm text-muted">{t("noChecks")}</p>
        )}
        {(aml ?? []).map((c, i) => {
          const image = c.field_key ? imageForKey(c.field_key) : undefined;
          const field = c.field_key ? fieldByKey.get(c.field_key) : undefined;
          const trigger = c.field_key ? triggerByKey.get(c.field_key) : undefined;
          const refImages = (field?.review?.refKeys ?? [])
            .map((k) => imageForKey(k))
            .filter((im): im is CheckImage => Boolean(im));
          return (
            <AmlCheckCard
              key={i}
              check={c as AmlCheckRow}
              image={image}
              refImages={refImages}
              sectionTitle={trigger?.section}
              fieldLabel={trigger?.question}
            />
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
        {definition ? (
          <div className="space-y-4">
            {definition.sections.map((s, si) => {
              const fields = s.fields.filter((f) => f.type !== "note");
              if (fields.length === 0) return null;
              const answered = fields.filter((f) => isAnswered(formData[f.key]));
              const empty = fields.filter((f) => !isAnswered(formData[f.key]));

              // Sección totalmente sin responder (típico de ramas no tomadas):
              // colapsada entera, con bg distinto, para no ensuciar la vista.
              if (answered.length === 0) {
                return (
                  <details
                    key={si}
                    className="rounded-xl border border-border bg-surface-2 p-4"
                  >
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
                      {resolveText(s.title, locale)} ·{" "}
                      {t("unanswered", { count: empty.length })}
                    </summary>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      {empty.map((f) => (
                        <FieldRow
                          key={f.id}
                          field={f}
                          value={formData[f.key]}
                          locale={locale}
                          signedUrls={signedUrls}
                        />
                      ))}
                    </dl>
                  </details>
                );
              }

              return (
                <Card key={si} className="p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    {resolveText(s.title, locale)}
                  </h3>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {answered.map((f) => (
                      <FieldRow
                        key={f.id}
                        field={f}
                        value={formData[f.key]}
                        locale={locale}
                        signedUrls={signedUrls}
                      />
                    ))}
                  </dl>
                  {empty.length > 0 && (
                    <details className="mt-3 rounded-lg bg-surface-2 p-2">
                      <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                        {t("unanswered", { count: empty.length })}
                      </summary>
                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        {empty.map((f) => (
                          <FieldRow
                            key={f.id}
                            field={f}
                            value={formData[f.key]}
                            locale={locale}
                            signedUrls={signedUrls}
                          />
                        ))}
                      </dl>
                    </details>
                  )}
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

/** Fila label/valor de una respuesta del formulario. */
function FieldRow({
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
  return (
    <div className="border-b border-border pb-1">
      <dt className="text-muted">{resolveText(field.label, locale) || field.key}</dt>
      <dd className="break-words text-foreground">
        <AnswerValue
          field={field}
          value={value}
          locale={locale}
          signedUrls={signedUrls}
        />
      </dd>
    </div>
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

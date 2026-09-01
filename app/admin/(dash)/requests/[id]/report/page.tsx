import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAnalyst } from "@/lib/auth/admin";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DocPreview } from "@/components/admin/DocPreview";
import { ReportActions } from "@/components/admin/ReportActions";
import { ReportCheckBlock } from "@/components/admin/ReportCheckBlock";
import type { CheckImage } from "@/components/admin/checkParts";
import { amlToBadge, scorePct, type AmlCheckRow } from "@/lib/didit/summary";
import { createSignedDocUrls } from "@/lib/kyb/service";
import { resolveRequestDefinition } from "@/lib/forms/store";
import { isAnswered, reachableSections, visibleFields } from "@/lib/forms/logic";
import { resolveText, type Field } from "@/lib/forms/definition";
import { renderAnswer, fileRefsOf } from "@/lib/forms/answers";

export const dynamic = "force-dynamic";

/**
 * Informe de verificación de una solicitud: solo las preguntas realmente
 * contestadas, con la verificación de DIDIT y su resumen justo debajo de la
 * pregunta que la disparó. Solo lectura y pensado para imprimirse a PDF (ver
 * el bloque `@media print` de globals.css).
 */
export default async function RequestReport({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("admin");
  const tR = await getTranslations("report");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: request } = await supabase
    .from("kyb_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!request) notFound();

  const [{ data: formRow }, { data: docs }, { data: aml }, analyst] = await Promise.all([
    supabase.from("kyb_form_responses").select("data").eq("request_id", id).maybeSingle(),
    supabase
      .from("kyb_documents")
      .select("id, doc_type, filename, storage_path, mime, uploaded_at")
      .eq("request_id", id),
    supabase
      .from("aml_checks")
      .select("id, provider, status, result, created_at, feature, field_key, score")
      .eq("request_id", id)
      // En el informe cada verificación va bajo su pregunta: el orden natural
      // es cronológico ascendente, no el "más reciente primero" del panel.
      .order("created_at", { ascending: true }),
    getAnalyst(),
  ]);

  const formData = (formRow?.data as Record<string, unknown>) ?? {};
  const checks = (aml ?? []) as AmlCheckRow[];
  const definition = await resolveRequestDefinition(
    (request as { form_definition?: unknown }).form_definition,
    (request as { form_id?: string | null }).form_id,
  );

  // Una sola firma para todos los archivos: los de las respuestas (cualquier
  // valor que sea un array de FileRef) y los de kyb_documents.
  const answerPaths = Object.values(formData).flatMap((v) =>
    fileRefsOf(v).map((r) => r.path),
  );
  const signedUrls = await createSignedDocUrls([
    ...(docs ?? []).map((d) => d.storage_path),
    ...answerPaths,
  ]);

  const fieldByKey = new Map<string, Field>();
  const questionByKey = new Map<string, string>();
  if (definition) {
    for (const s of definition.sections) {
      for (const f of s.fields) {
        fieldByKey.set(f.key, f);
        questionByKey.set(f.key, resolveText(f.label, locale) || f.key);
      }
    }
  }
  const imageForKey = (key: string): CheckImage | undefined => {
    const ref = fileRefsOf(formData[key])[0];
    return ref
      ? { filename: ref.filename, path: ref.path, url: signedUrls[ref.path] }
      : undefined;
  };

  // ---------- Qué preguntas entran al informe ----------
  // `reachableSections` (no `visibleSections`) respeta los saltos del flujo:
  // una rama que el solicitante nunca tomó no aparece. Sobre eso, solo lo
  // efectivamente contestado. Es el mismo criterio de la validación de envío.
  const groups = definition
    ? reachableSections(definition, formData)
        .map((s) => ({
          title: resolveText(s.title, locale),
          fields: visibleFields(s, formData).filter(
            (f) => f.type !== "note" && isAnswered(formData[f.key]),
          ),
        }))
        .filter((g) => g.fields.length > 0)
    : [];

  const shownKeys = new Set(groups.flatMap((g) => g.fields.map((f) => f.key)));

  // Verificaciones agrupadas por la pregunta que las disparó.
  const checksByKey = new Map<string, AmlCheckRow[]>();
  for (const c of checks) {
    if (!c.field_key) continue;
    const list = checksByKey.get(c.field_key);
    if (list) list.push(c);
    else checksByKey.set(c.field_key, [c]);
  }
  // Sin pregunta asociada o cuya pregunta no se muestra (p. ej. kyb_registry,
  // que es un ciclo manual del analista): van al final, nunca se pierden.
  const orphanChecks = checks.filter(
    (c) => !c.field_key || !shownKeys.has(c.field_key),
  );

  // Respuestas fuera del flujo alcanzado (borrador sin podar, o definición que
  // cambió después del envío). Se listan aparte en vez de desaparecer.
  const otherAnswers = Object.entries(formData).filter(
    ([k, v]) => !shownKeys.has(k) && isAnswered(v) && fieldByKey.get(k)?.type !== "note",
  );

  // Documentos que no cuelgan de ninguna pregunta mostrada.
  const orphanDocs = (docs ?? []).filter((d) => !shownKeys.has(d.doc_type));

  const counts = {
    passed: checks.filter((c) => c.status === "passed").length,
    flagged: checks.filter((c) => c.status === "flagged").length,
    pending: checks.filter((c) => c.status === "pending").length,
    error: checks.filter((c) => c.status === "error").length,
  };

  const fmtDate = (v: unknown): string => {
    if (typeof v !== "string" || !v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? "—"
      : new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(d);
  };

  const req = request as Record<string, unknown>;

  return (
    <main className="print-doc mx-auto w-full max-w-3xl p-6">
      <div
        data-no-print
        className="mb-4 flex flex-wrap items-center justify-between gap-2"
      >
        <Link href={`/admin/requests/${id}`} className="text-sm text-brand hover:underline">
          ← {tCommon("back")}
        </Link>
        <ReportActions requestId={id} />
      </div>

      {/* Portada */}
      <header className="print-block mb-6 border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {tR("title")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {String(req.external_ref ?? id)}
          </h1>
          <StatusBadge status={String(req.status)} />
        </div>
        <p className="mt-1 text-xs text-muted">ID: {id}</p>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {definition && (
            <Meta label={tR("formUsed")}>
              {resolveText(definition.title, locale) || "—"}
              {typeof req.form_revision === "number" ? (
                <span className="text-muted"> · {tR("revision")} {req.form_revision}</span>
              ) : null}
            </Meta>
          )}
          <Meta label={tR("createdAt")}>{fmtDate(req.created_at)}</Meta>
          <Meta label={tR("submittedAt")}>{fmtDate(req.submitted_at)}</Meta>
          {req.decided_at ? (
            <Meta label={tR("decidedAt")}>{fmtDate(req.decided_at)}</Meta>
          ) : null}
          {req.decision ? (
            <Meta label={t("decision")}>
              <StatusBadge status={String(req.decision)} />
            </Meta>
          ) : null}
        </dl>
        {req.decision_reason ? (
          <p className="mt-2 text-sm text-foreground">
            <span className="text-muted">{tR("decisionReason")}: </span>
            {String(req.decision_reason)}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted">
          {tR("generatedAt", {
            date: fmtDate(new Date().toISOString()),
            actor: analyst?.email ?? "—",
          })}
        </p>
      </header>

      {/* Resumen de verificaciones */}
      <ReportSection title={tR("checksSummary")}>
        {checks.length === 0 ? (
          <p className="text-sm text-muted">{t("noChecks")}</p>
        ) : (
          // Sin `print-block`: una tabla larga debe poder cortarse entre
          // páginas (el navegador repite el thead), no saltar entera.
          <Card className="print-flat overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">{tR("colCheck")}</th>
                  <th className="px-3 py-2 font-semibold">{tR("colQuestion")}</th>
                  <th className="px-3 py-2 font-semibold">{tR("colStatus")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{tR("colScore")}</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <SummaryRow
                    key={c.id}
                    check={c}
                    question={c.field_key ? questionByKey.get(c.field_key) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {checks.length > 0 && (
          <p className="mt-2 text-xs text-muted">{tR("counts", counts)}</p>
        )}
      </ReportSection>

      {/* Respuestas contestadas, con su verificación debajo.
          En papel cada sección abre página: el salto va en el <h2> (para que no
          quede huérfano al pie de la página anterior) y en cada sección MENOS la
          primera, que ya arranca con ese salto. */}
      <ReportSection title={tR("answers")} className="print-page">
        {groups.length === 0 && otherAnswers.length === 0 && (
          <p className="text-sm text-muted">{tR("noAnswers")}</p>
        )}
        <div className="space-y-4">
          {groups.map((g, gi) => (
            <Card key={gi} className={`print-flat p-4 ${gi > 0 ? "print-page" : ""}`}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {g.title}
                {/* Encabezado de hoja: una página suelta del expediente sigue
                    siendo identificable. */}
                <span className="hidden print:inline"> · {String(req.external_ref ?? id)}</span>
              </h3>
              <div className="space-y-4">
                {g.fields.map((f) => (
                  <div key={f.id} className="print-block">
                    <p className="text-xs text-muted">
                      {resolveText(f.label, locale) || f.key}
                    </p>
                    <div className="mt-0.5 break-words text-sm text-foreground">
                      <AnswerValue
                        field={f}
                        value={formData[f.key]}
                        locale={locale}
                        signedUrls={signedUrls}
                      />
                    </div>
                    {(checksByKey.get(f.key) ?? []).map((c) => (
                      <ReportCheckBlock
                        key={c.id}
                        check={c}
                        image={imageForKey(f.key)}
                        refImages={(f.review?.refKeys ?? [])
                          .map((k) => imageForKey(k))
                          .filter((im): im is CheckImage => Boolean(im))}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </ReportSection>

      {/* Verificaciones sin pregunta mostrada (típico: kyb_registry manual) */}
      {orphanChecks.length > 0 && (
        <ReportSection title={tR("otherChecks")} className="print-page">
          {orphanChecks.map((c) => (
            <div key={c.id} className="print-block">
              {c.field_key && (
                <p className="mt-2 text-xs text-muted">
                  {t("question")}: {questionByKey.get(c.field_key) ?? c.field_key}
                </p>
              )}
              <ReportCheckBlock
                check={c}
                image={c.field_key ? imageForKey(c.field_key) : undefined}
                refImages={(c.field_key
                  ? (fieldByKey.get(c.field_key)?.review?.refKeys ?? [])
                  : []
                )
                  .map((k) => imageForKey(k))
                  .filter((im): im is CheckImage => Boolean(im))}
              />
            </div>
          ))}
        </ReportSection>
      )}

      {/* Red de seguridad: nada contestado se pierde del informe */}
      {otherAnswers.length > 0 && (
        <ReportSection title={tR("otherAnswers")} className="print-page">
          <Card className="print-flat print-block p-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {otherAnswers.map(([k, v]) => {
                const field = fieldByKey.get(k);
                return (
                  <div key={k} className="border-b border-border pb-1">
                    <dt className="text-muted">{questionByKey.get(k) ?? k}</dt>
                    <dd className="break-words text-foreground">
                      {field ? (
                        <AnswerValue
                          field={field}
                          value={v}
                          locale={locale}
                          signedUrls={signedUrls}
                        />
                      ) : typeof v === "object" ? (
                        JSON.stringify(v)
                      ) : (
                        String(v)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
        </ReportSection>
      )}

      {orphanDocs.length > 0 && (
        <ReportSection title={tR("otherDocuments")} className="print-page">
          <div className="print-block flex flex-wrap gap-4 text-sm">
            {orphanDocs.map((d) => (
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
        </ReportSection>
      )}

      <p className="mt-8 border-t border-border pt-3 text-xs text-muted">
        {tR("confidential")}
      </p>
    </main>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  );
}

async function SummaryRow({
  check,
  question,
}: {
  check: AmlCheckRow;
  question?: string;
}) {
  const t = await getTranslations("admin");
  const tB = await getTranslations("builder");
  const featureKey = check.feature ? `didit_${check.feature}` : null;
  const title = featureKey && tB.has(featureKey) ? tB(featureKey) : t("amlResult");
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2 text-foreground">{title}</td>
      <td className="px-3 py-2 text-muted">{question ?? check.field_key ?? "—"}</td>
      <td className="px-3 py-2">
        <StatusBadge status={amlToBadge(check.status)} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-foreground">
        {typeof check.score === "number" ? `${scorePct(check.score).toFixed(2)}%` : "—"}
      </td>
    </tr>
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
          <DocPreview key={i} path={r.path} filename={r.filename} url={signedUrls[r.path]} />
        ))}
      </div>
    );
  }
  return <>{renderAnswer(field, value, locale)}</>;
}

function ReportSection({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  /** Para el salto de página en impresión (`print-page`). */
  className?: string;
}) {
  return (
    <section className={`mb-6 ${className}`}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

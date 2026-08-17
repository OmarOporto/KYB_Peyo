import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAnalyst } from "@/lib/auth/admin";
import {
  clientAllowsTranslation,
  translatableLocales,
  translateAnswers,
} from "@/lib/i18n-ai/answers";
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
import { RequestChangesPanel } from "@/components/admin/RequestChangesPanel";
import { RunKybRegistryButton } from "@/components/admin/RunKybRegistryButton";
import { extractKybDeclared } from "@/lib/didit/verify";
import { isTerminal, createSignedDocUrls } from "@/lib/kyb/service";
import type { KybCorrections, KybStatus } from "@/lib/kyb/types";
import { resolveRequestDefinition } from "@/lib/forms/store";
import { isAnswered } from "@/lib/forms/logic";
import { resolveText, type Field } from "@/lib/forms/definition";
import { renderAnswer, fileRefsOf } from "@/lib/forms/answers";

export const dynamic = "force-dynamic";
// Las acciones de este detalle pueden llamar a DIDIT (re-verificar, seleccionar
// candidato KYB); las búsquedas registrales tardan hasta ~90s.
export const maxDuration = 180;

export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tr?: string }>;
}) {
  const t = await getTranslations("admin");
  const tCommon = await getTranslations("common");
  const { id } = await params;
  const { tr } = await searchParams;
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
      .select("id, provider, status, result, created_at, feature, field_key, score")
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const formData = (formRow?.data as Record<string, unknown>) ?? {};
  const status = request.status as KybStatus;
  const closed = isTerminal(status);
  // Solo se puede decidir/pedir correcciones sobre una solicitud ya enviada y
  // aún abierta (no mientras el solicitante ya está corrigiendo).
  const canDecide = status === "submitted" || status === "under_review";
  const corrections = (request as { corrections?: KybCorrections | null })
    .corrections;
  const locale = await getLocale();
  // Definición congelada del request (lo que el solicitante realmente llenó).
  const definition = await resolveRequestDefinition(
    (request as { form_definition?: unknown }).form_definition,
    (request as { form_id?: string | null }).form_id,
  );

  // Validación registral (kyb_registry): ciclo manual del analista.
  const hasKybField = Boolean(
    definition?.sections.some((s) =>
      s.fields.some(
        (f) => f.review?.provider === "didit" && f.review.feature === "kyb_registry",
      ),
    ),
  );
  // Datos declarados que enviaría el ciclo (misma función que el run real):
  // alimentan el tooltip del botón para que el analista vea qué se mandará.
  const kybDeclared = hasKybField && definition ? extractKybDeclared(definition, formData) : null;
  // Bloqueado mientras hay búsqueda en curso o un select en vuelo/incierto.
  // (Una fila pending en candidate_selection NO bloquea: un run nuevo la
  // supersede — equivale a "repetir búsqueda".)
  const kybCycleLocked = (aml ?? []).some((c) => {
    if (c.feature !== "kyb_registry" || c.status !== "pending") return false;
    const res = (c.result ?? {}) as {
      phase?: string;
      selected?: { select_attempted?: boolean };
    };
    return (
      res.phase === "search" ||
      res.phase === "select" ||
      Boolean(res.selected?.select_attempted)
    );
  });

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

  // ---------- Traducción de respuestas (texto libre) ----------
  // Se gatea con el opt-in del cliente DUEÑO de la solicitud: el consentimiento
  // es sobre el dato, no sobre quién lo mira, así que un analista tampoco puede
  // mandar a un proveedor externo lo que el cliente no habilitó. Los intakes
  // públicos (`/forms/[id]`) no tienen dueño y quedan permitidos: son los
  // formularios propios del operador.
  const ownerKeyId = (request as { api_key_id?: string | null }).api_key_id ?? null;
  const trLocales = translatableLocales(definition);
  const trTarget = tr && trLocales.includes(tr) ? tr : null;
  const trAllowed = ownerKeyId ? await clientAllowsTranslation(ownerKeyId) : true;

  let answerTranslations: Record<string, string> | undefined;
  if (trTarget && trAllowed) {
    // El layout de (dash) ya exige analista; esto es solo para el actor del audit.
    const analyst = await getAnalyst();
    try {
      const out = await translateAnswers(id, definition, formData, trTarget, {
        actor: analyst?.email ?? "analyst",
      });
      answerTranslations = out.byKey;
    } catch (e) {
      console.error(
        "[i18n-ai] answers translation failed",
        e instanceof Error ? e.message : e,
      );
    }
  }

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
        <div className="mb-2 flex flex-wrap items-start gap-2">
          <form action={rerunVerificationsAction.bind(null, id)}>
            <Button type="submit" variant="outline" size="sm">
              {t("reverify")}
            </Button>
          </form>
          {/* Validación registral: ciclo manual (search gratis ~90s; el select
              facturable queda detrás del picker o del match exacto) */}
          {hasKybField && (
            <RunKybRegistryButton
              requestId={id}
              disabled={kybCycleLocked}
              declared={
                kybDeclared
                  ? {
                      name: kybDeclared.name,
                      registrationNumber: kybDeclared.registrationNumber ?? null,
                      country: kybDeclared.country ?? null,
                    }
                  : null
              }
            />
          )}
        </div>
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
              requestId={id}
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
      <Section
        title={t("form")}
        action={
          trLocales.length > 0 ? (
            trAllowed ? (
              <div className="flex items-center gap-2 text-xs">
                {trTarget ? (
                  <Link href={`/admin/requests/${id}`} className="text-brand hover:underline">
                    {t("showOriginal")}
                  </Link>
                ) : null}
                {trLocales
                  .filter((l) => l !== trTarget)
                  .map((l) => (
                    <Link
                      key={l}
                      href={`/admin/requests/${id}?tr=${l}`}
                      className="text-brand hover:underline"
                    >
                      {t("translateAnswersTo", { locale: l.toUpperCase() })}
                    </Link>
                  ))}
                {trTarget && <span className="text-muted">{t("translatedNote")}</span>}
              </div>
            ) : (
              <span className="text-xs text-muted" title={t("translateDisabledHint")}>
                {t("translateDisabled")}
              </span>
            )
          ) : undefined
        }
      >
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
                          translated={answerTranslations?.[f.key]}
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
                        translated={answerTranslations?.[f.key]}
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
                            translated={answerTranslations?.[f.key]}
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
      {canDecide && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <form action={decideAction.bind(null, id, "approved")}>
              <Button variant="success">{t("approve")}</Button>
            </form>
            <form action={decideAction.bind(null, id, "rejected")} className="flex flex-col gap-2">
              <textarea
                name="reason"
                rows={2}
                className="w-64 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand"
                placeholder={t("rejectReason")}
              />
              <Button variant="danger">{t("reject")}</Button>
            </form>
          </div>
          {definition && (
            <RequestChangesPanel
              requestId={id}
              fields={definition.sections.flatMap((s) =>
                s.fields
                  .filter((f) => f.type !== "note")
                  .map((f) => ({
                    key: f.key,
                    label: resolveText(f.label, locale) || f.key,
                    section: resolveText(s.title, locale),
                  })),
              )}
            />
          )}
        </div>
      )}
      {status === "changes_requested" && corrections && (
        <Card className="mt-6 p-4">
          <p className="text-sm font-medium text-foreground">
            {t("awaitingCorrections", { round: corrections.round })}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {corrections.fields.map((f) => (
              <li key={f.key}>
                <strong className="text-foreground">
                  {triggerByKey.get(f.key)?.question ?? f.key}
                </strong>
                {f.note ? ` — ${f.note}` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {closed && (
        <p className="mt-6 text-sm text-muted">
          {t("decision")}:{" "}
          <strong className="text-foreground">
            {request.decision ?? request.status}
          </strong>
          {request.decision_reason ? (
            <span className="mt-1 block text-foreground">
              {request.decision_reason}
            </span>
          ) : null}
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
  translated,
}: {
  field: Field;
  value: unknown;
  locale: string;
  signedUrls: Record<string, string>;
  /** Traducción del texto libre, si se pidió. */
  translated?: string;
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
        {/* El original queda como valor principal: es el registro de lo que
            declaró el solicitante. La traducción es una ayuda de lectura. */}
        {translated && (
          <span className="mt-0.5 block text-xs italic text-muted">{translated}</span>
        )}
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
  action,
}: {
  title: string;
  children: React.ReactNode;
  /** Control opcional alineado a la derecha del encabezado. */
  action?: React.ReactNode;
}) {
  if (action) {
    return (
      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
            {title}
          </h2>
          <div className="ml-auto">{action}</div>
        </div>
        {children}
      </section>
    );
  }
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

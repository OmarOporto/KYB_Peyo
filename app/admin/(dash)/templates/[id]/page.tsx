import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { inputCls } from "@/components/ui/Field";
import { DeleteTemplateButton } from "@/components/admin/DeleteTemplateButton";
import { text, type NormalizedSection } from "@/lib/didit/questionnaires";

export const dynamic = "force-dynamic";

/** Renderiza un campo importado como preview de solo lectura según su tipo DIDIT. */
function PreviewField({
  label,
  type,
  options,
}: {
  label: string;
  type: string | null;
  options?: string[];
}) {
  const kind = (type ?? "").toUpperCase();
  const isChoice =
    kind.includes("CHOICE") || kind.includes("DROPDOWN") || kind.includes("SELECT");
  const multiple = kind.includes("MULTIPLE");
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label || "—"}
      </label>
      {isChoice ? (
        (options ?? []).length ? (
          <ul className="space-y-1.5">
            {(options ?? []).map((o, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type={multiple ? "checkbox" : "radio"}
                  disabled
                  className="accent-brand"
                />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">—</p>
        )
      ) : kind.includes("FILE") ? (
        <input type="file" className="text-sm text-muted" disabled />
      ) : kind.includes("DATE") ? (
        <input type="date" className={inputCls} disabled />
      ) : kind.includes("LONG") || kind.includes("TEXTAREA") ? (
        <textarea className={inputCls} rows={2} disabled />
      ) : (
        <input className={inputCls} disabled />
      )}
    </div>
  );
}

export default async function TemplateDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tt = await getTranslations("templates");
  const td = await getTranslations("didit");
  const locale = await getLocale();

  const supabase = await createServerSupabase();
  const { data: tpl } = await supabase
    .from("form_templates")
    .select("id, name, source, source_ref, definition, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!tpl) notFound();

  const def = tpl.definition as { sections?: NormalizedSection[] };
  const sections = def.sections ?? [];

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <Link href="/admin/templates" className="text-sm text-brand hover:underline">
        ← {tt("back")}
      </Link>

      <header className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
            {td("importedFrom")}
          </span>
          <h1 className="mt-2 font-display text-2xl font-bold text-foreground">
            {tpl.name}
          </h1>
          <p className="text-sm text-muted">{td("previewSubtitle")}</p>
        </div>
        <DeleteTemplateButton id={tpl.id} />
      </header>

      <div className="space-y-4">
        {sections.map((section, si) => (
          <Card key={si} className="p-5">
            {text(section.title, locale) && (
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {text(section.title, locale)}
              </h2>
            )}
            <div className="space-y-3">
              {section.questions.map((q, qi) => (
                <PreviewField
                  key={qi}
                  label={text(q.label, locale)}
                  type={q.type}
                  options={q.options?.map((o) => text(o.label, locale))}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}

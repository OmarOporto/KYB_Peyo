import { Card } from "@/components/ui/Card";
import { text, type NormalizedSection } from "@/lib/didit/questionnaires";

/** Vista de solo lectura del flujo de preguntas (secciones + items). Server component. */
export function DiditFlow({
  sections,
  locale,
  labels,
}: {
  sections: NormalizedSection[];
  locale: string;
  labels: { required: string; optional: string; options: string };
}) {
  return (
    <div className="space-y-4">
      {sections.map((section, si) => (
        <Card key={si} className="p-4">
          {text(section.title, locale) && (
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              {text(section.title, locale)}
            </h2>
          )}
          <ul className="space-y-3">
            {section.questions.map((q, qi) => (
              <li key={qi} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-foreground">
                    {text(q.label, locale) || "—"}
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    {q.type ?? "?"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {q.required ? labels.required : labels.optional}
                </p>
                {q.options && q.options.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    {labels.options}:{" "}
                    {q.options.map((o) => text(o.label, locale)).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

import {
  curatedRows,
  fmt,
  kybCompare,
  scorePct,
  type KybVerdict,
  type Node,
} from "@/lib/didit/summary";

/**
 * Piezas visuales de un check de DIDIT, compartidas por la tarjeta operativa
 * (`AmlCheckCard`) y el informe imprimible (`ReportCheckBlock`). Reciben los
 * traductores por prop para servir a ambos sin acoplarse a un namespace.
 */

/** Imagen (del solicitante) ya resuelta y firmada por la página. */
export type CheckImage = { filename: string; path: string; url?: string };

/** Medidor de un valor 0–100. Verde = bueno; rojo = riesgo. El número siempre visible. */
export function Meter({
  value,
  risk,
  label,
}: {
  value: number;
  risk: boolean;
  label: string;
}) {
  const pct = scorePct(value);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums text-foreground">{pct.toFixed(2)}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full ${risk ? "bg-danger" : "bg-success"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Campos clave curados de la feature, en dos columnas. */
export function CuratedFields({
  feature,
  node,
  cf,
}: {
  feature: string | null;
  node: Node | null;
  cf: (k: string) => string;
}) {
  const rows = curatedRows(feature, node);
  if (rows.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.labelKey} className="flex flex-col">
          <dt className="text-muted">{cf(r.labelKey)}</dt>
          <dd className="break-words text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Coincidencias de AML (hits): nombre, listas y scores. */
export function AmlHits({ node }: { node: Node }) {
  const hits = Array.isArray(node.hits) ? node.hits : [];
  if (!hits.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {hits.slice(0, 10).map((h, i) => {
        const hit = (h ?? {}) as Node;
        const datasets = Array.isArray(hit.datasets) ? hit.datasets.join(", ") : "";
        return (
          <div key={i} className="rounded-lg border border-border p-2 text-xs">
            <div className="font-medium text-foreground">{fmt(hit.caption) || "—"}</div>
            {datasets && <div className="text-muted">{datasets}</div>}
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-muted">
              {typeof hit.match_score === "number" && <span>match {hit.match_score}</span>}
              {typeof hit.risk_score === "number" && <span>risk {hit.risk_score}</span>}
              {hit.review_status ? <span>{fmt(hit.review_status)}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Información declarada" (lo que ingresó el solicitante) y comparación
 * compacta contra el registro oficial cuando ya hay perfil (select hecho).
 */
export function KybDeclaredBlock({
  declared,
  node,
  cf,
  t,
}: {
  declared: Node;
  node: Node | null;
  cf: (k: string) => string;
  t: (k: string) => string;
}) {
  const rows = [
    { label: cf("companyName"), value: fmt(declared.name) },
    { label: cf("regNumber"), value: fmt(declared.registration_number) },
    { label: cf("registryCountry"), value: fmt(declared.country) },
  ].filter((r) => r.value);
  if (!rows.length) return null;

  const cmp = kybCompare(declared, node);
  const verdictCls: Record<KybVerdict, string> = {
    exact: "bg-success/15 text-success",
    different: "bg-danger/15 text-danger",
    review: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  const verdictLabel: Record<KybVerdict, string> = {
    exact: t("kybMatchExact"),
    different: t("kybMatchDifferent"),
    review: t("kybMatchReview"),
  };

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-foreground">{t("kybDeclared")}</p>
      <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col">
            <dt className="text-muted">{r.label}</dt>
            <dd className="break-words text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
      {cmp.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-foreground">{t("kybCompare")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {cmp.map((c) => (
              <span
                key={c.labelKey}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${verdictCls[c.verdict]}`}
              >
                {cf(c.labelKey)}: {verdictLabel[c.verdict]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Directivos y beneficiarios finales del perfil registral (kyb_registry). */
export function KybRegistryPeople({
  node,
  cf,
}: {
  node: Node;
  cf: (k: string) => string;
}) {
  const officers = Array.isArray(node.officers) ? node.officers : [];
  const owners = Array.isArray(node.beneficial_owners) ? node.beneficial_owners : [];
  if (!officers.length && !owners.length) return null;
  const renderList = (title: string, items: unknown[]) => {
    if (!items.length) return null;
    return (
      <div className="mt-2">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <div className="mt-1 space-y-1">
          {items.slice(0, 15).map((p, i) => {
            const o = (p ?? {}) as Node;
            const detail = [
              fmt(o.designation) || fmt(o.role),
              fmt(o.ownership_percentage) && `${fmt(o.ownership_percentage)}%`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={i}
                className={`rounded-lg border border-border p-2 text-xs ${
                  o.is_active === false ? "opacity-60" : ""
                }`}
              >
                <span className="font-medium text-foreground">{fmt(o.name) || "—"}</span>
                {detail && <span className="text-muted"> · {detail}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <>
      {renderList(cf("officers"), officers)}
      {renderList(cf("beneficialOwners"), owners)}
    </>
  );
}

/** Advertencias de DIDIT (universal): ámbar (info) o rojo (error). */
export function Warnings({ node }: { node: Node }) {
  const warnings = Array.isArray(node.warnings) ? node.warnings : [];
  if (!warnings.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {warnings.map((w, i) => {
        const warn = (w ?? {}) as Node;
        const isError = String(warn.log_type) === "error";
        const text = fmt(warn.short_description) || fmt(warn.risk) || "—";
        return (
          <div
            key={i}
            className={`rounded-lg px-2 py-1 text-xs ${
              isError
                ? "bg-danger/10 text-danger"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            <span className="font-medium">{text}</span>
            {warn.risk && warn.short_description ? (
              <span className="opacity-70"> · {fmt(warn.risk)}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

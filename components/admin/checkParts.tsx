import {
  curatedRows,
  fmt,
  kybCompare,
  scorePct,
  type KybVerdict,
  type Node,
} from "@/lib/didit/summary";
import { AnswerField } from "@/components/admin/answerParts";
import { DocPreview, isImagePath } from "@/components/admin/DocPreview";

/**
 * Piezas visuales de un check de DIDIT, compartidas por la tarjeta operativa
 * (`AmlCheckCard`) y el informe imprimible (`ReportCheckBlock`). Reciben los
 * traductores por prop para servir a ambos sin acoplarse a un namespace.
 */

/** Imagen (del solicitante) ya resuelta y firmada por la página. */
export type CheckImage = { filename: string; path: string; url?: string };

/**
 * El documento que se verificó, al lado de los campos extraídos.
 *
 * `shrink-0` está para proteger la MINIATURA, que tiene ancho intrínseco. Cuando
 * el archivo no es imagen no hay miniatura: `DocPreview` cae a un `DocLink` cuyo
 * texto es el nombre COMPLETO del archivo, y ahí `shrink-0` blindaba su ancho
 * max-content —524px medidos con un nombre real de DIDIT, de 696px útiles: los
 * campos se quedaban en 158px y la rejilla los partía en dos columnas de 71px,
 * con las etiquetas rotas en cuatro líneas y los valores carácter a carácter—.
 * Sin miniatura ocupa su propia línea del flex y los campos bajan enteros.
 */
export function CheckDoc({
  doc,
  cf,
  labelKey,
}: {
  doc: CheckImage;
  cf: (k: string) => string;
  labelKey: "imageUsed" | "refImage";
}) {
  const thumb = Boolean(doc.url) && isImagePath(doc.filename);
  // «Imagen recibida» miente cuando lo recibido es un PDF. `refImage` ya es
  // neutra («Documento de referencia»), así que solo se sustituye la otra.
  const label = labelKey === "imageUsed" && !thumb ? "docUsed" : labelKey;
  return (
    <div className={thumb ? "shrink-0" : "min-w-0 basis-full"}>
      <p className="mb-1 text-xs text-muted">{cf(label)}</p>
      <DocPreview path={doc.path} filename={doc.filename} url={doc.url} />
    </div>
  );
}

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
      {/* El BORDE dibuja la pista, no un `ring`: un `ring` es `box-shadow` y se
          pinta por DEBAJO de los descendientes, así que el hijo relleno tapaba
          el anillo en la zona llena y solo quedaba visible en la cola vacía —un
          escalón a media barra. El borde queda fuera del content box y el hijo
          no lo alcanza. `border-box` mantiene los 8px totales. */}
      <div
        className="h-2 w-full overflow-hidden rounded-full border border-border bg-surface-2"
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
    // `@container` y no `sm:`: la rejilla vive en una columna de un flex, así que
    // el ancho del VIEWPORT no dice nada de lo que ella tiene. Con `sm:` bastaba
    // que un vecino se comiera la fila para acabar con dos columnas de 85px en
    // una pantalla de escritorio. Dos columnas solo a partir de 24rem propios.
    <div className="@container mt-2">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 @sm:grid-cols-2">
        {rows.map((r) => (
          <AnswerField key={r.labelKey} size="sm" label={cf(r.labelKey)}>
            {r.value}
          </AnswerField>
        ))}
      </dl>
    </div>
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
    review: "bg-warning/10 text-warning",
  };
  const verdictLabel: Record<KybVerdict, string> = {
    exact: t("kybMatchExact"),
    different: t("kybMatchDifferent"),
    review: t("kybMatchReview"),
  };

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-foreground">{t("kybDeclared")}</p>
      <div className="@container mt-1">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 @sm:grid-cols-2">
          {rows.map((r) => (
            <AnswerField key={r.label} size="sm" label={r.label}>
              {r.value}
            </AnswerField>
          ))}
        </dl>
      </div>
      {cmp.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-foreground">{t("kybCompare")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {cmp.map((c) => (
              <span
                key={c.labelKey}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${verdictCls[c.verdict]}`}
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
                  // En papel el 60% deja el texto en 4,47:1, justo por debajo de
                  // AA; el 80% desjerarquiza igual y sube a 8,68:1.
                  o.is_active === false ? "opacity-60 print:opacity-80" : ""
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
                : "bg-warning/10 text-warning"
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

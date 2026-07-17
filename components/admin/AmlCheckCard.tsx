import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DocPreview } from "@/components/admin/DocPreview";

/** Fila de aml_checks (subset que consume la tarjeta). */
export type AmlCheckRow = {
  provider: string;
  status: string;
  result: unknown;
  feature: string | null;
  field_key: string | null;
  score: number | null;
  created_at: string;
};

/** Imagen (del solicitante) ya resuelta y firmada por la página. */
export type CheckImage = { filename: string; path: string; url?: string };

// El envelope de DIDIT anida el resultado bajo una clave por feature.
const NODE_KEYS: Record<string, string[]> = {
  aml_screening: ["aml"],
  id_verification: ["id_verification"],
  face_match: ["face_match"],
  proof_of_address: ["poa", "proof_of_address"],
  age_estimation: ["age_estimation"],
  liveness: ["liveness"],
  database_validation: ["database_validation"],
};

// Features cuyo `score` es RIESGO (mayor = peor); el resto es confianza (mayor = mejor).
const RISK_FEATURES = new Set(["aml_screening"]);

type Node = Record<string, unknown>;

function nodeOf(feature: string | null, result: unknown): Node | null {
  if (!result || typeof result !== "object") return null;
  const env = result as Node;
  const keys = feature ? (NODE_KEYS[feature] ?? [feature]) : [];
  for (const k of keys) {
    const v = env[k];
    if (v && typeof v === "object") return v as Node;
  }
  return null;
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

/** Formatea un valor escalar para mostrarlo; devuelve "" para lo que no aplica. */
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return "";
}

function joinType(a: unknown, b: unknown): string {
  return [a, b].filter((x) => typeof x === "string" && x).join(" · ");
}

export async function AmlCheckCard({
  check,
  image,
  refImages,
}: {
  check: AmlCheckRow;
  image?: CheckImage;
  /** Imágenes de referencia (p. ej. el documento contra el que se hizo el face match). */
  refImages?: CheckImage[];
}) {
  const t = await getTranslations("admin");
  const tB = await getTranslations("builder");

  const feature = check.feature;
  const featureKey = feature ? `didit_${feature}` : null;
  const title = featureKey && tB.has(featureKey) ? tB(featureKey) : t("amlResult");
  const node = nodeOf(feature, check.result);
  const risk = feature ? RISK_FEATURES.has(feature) : false;

  const cf = (k: string) => t(`checkFields.${k}`);

  // Campos clave curados por feature (se omiten los nulos).
  const rows: { label: string; value: string }[] = [];
  const push = (labelKey: string, v: unknown) => {
    const s = fmt(v);
    if (s) rows.push({ label: cf(labelKey), value: s });
  };
  if (node) {
    switch (feature) {
      case "id_verification":
        push("fullName", node.full_name);
        push("docType", joinType(node.document_type, node.document_subtype));
        push("docNumber", node.document_number);
        push("dob", node.date_of_birth);
        push("issuingState", node.issuing_state_name ?? node.issuing_state);
        push("expiration", node.expiration_date);
        push("gender", node.gender);
        push("age", node.age);
        break;
      case "age_estimation": {
        const age = node.age_estimation;
        if (typeof age === "number") push("estimatedAge", Math.round(age));
        break;
      }
      case "proof_of_address":
        push("docType", joinType(node.document_type, node.document_subtype));
        push("issuer", node.issuer);
        push("issueDate", node.issue_date);
        push("nameOnDoc", node.name_on_document);
        push("address", node.poa_formatted_address ?? node.poa_address);
        break;
      case "liveness":
        push("faceQuality", node.face_quality);
        break;
      case "aml_screening":
        push("entityType", node.entity_type);
        push("totalHits", node.total_hits);
        break;
    }
  }

  return (
    <Card className="mb-2 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{title}</span>
        <StatusBadge status={amlToBadge(check.status)} />
        <span className="ml-auto text-xs text-muted">{check.provider}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {image?.url && (
          <div className="shrink-0">
            <p className="mb-1 text-xs text-muted">{cf("imageUsed")}</p>
            <DocPreview path={image.path} filename={image.filename} url={image.url} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {typeof check.score === "number" && (
            <Meter value={check.score} risk={risk} label={scoreLabel(feature, cf)} />
          )}
          {rows.length > 0 && (
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.label} className="flex flex-col">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="break-words text-foreground">{r.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {refImages && refImages.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                {cf("refImage")}
              </summary>
              <div className="mt-1 flex flex-wrap gap-2">
                {refImages.map((im, idx) => (
                  <DocPreview key={idx} path={im.path} filename={im.filename} url={im.url} />
                ))}
              </div>
            </details>
          )}
          {feature === "aml_screening" && node && <AmlHits node={node} />}
          {node && <Warnings node={node} />}
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
          {t("rawResponse")}
        </summary>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs whitespace-pre-wrap break-words text-muted">
          {JSON.stringify(check.result, null, 2)}
        </pre>
      </details>
    </Card>
  );
}

function scoreLabel(feature: string | null, cf: (k: string) => string): string {
  switch (feature) {
    case "face_match":
      return cf("matchScore");
    case "liveness":
      return cf("liveness");
    case "aml_screening":
      return cf("riskScore");
    default:
      return cf("confidence");
  }
}

/** Medidor de un valor 0–100. Verde = bueno; rojo = riesgo. El número siempre visible. */
function Meter({ value, risk, label }: { value: number; risk: boolean; label: string }) {
  const pct = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
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

/** Coincidencias de AML (hits): nombre, listas y scores. */
function AmlHits({ node }: { node: Node }) {
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

/** Advertencias de DIDIT (universal): ámbar (info) o rojo (error). */
function Warnings({ node }: { node: Node }) {
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

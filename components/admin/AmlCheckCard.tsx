import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DocPreview } from "@/components/admin/DocPreview";
import { KybCandidatePicker } from "@/components/admin/KybCandidatePicker";

/** Fila de aml_checks (subset que consume la tarjeta). */
export type AmlCheckRow = {
  id: string;
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
  kyb_registry: ["kyb_registry"],
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
  sectionTitle,
  fieldLabel,
  requestId,
}: {
  check: AmlCheckRow;
  image?: CheckImage;
  /** Imágenes de referencia (p. ej. el documento contra el que se hizo el face match). */
  refImages?: CheckImage[];
  /** Sección y pregunta del formulario que dispararon esta verificación. */
  sectionTitle?: string;
  fieldLabel?: string;
  /** Necesario para las acciones de kyb_registry (picker / repetir búsqueda). */
  requestId?: string;
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
      case "kyb_registry":
        push("companyName", node.company_name);
        push("regNumber", node.registration_number);
        push("registryStatus", node.registry_status);
        push("registryCountry", node.country_code);
        push("incorporationDate", node.incorporation_date);
        push("address", node.registered_address);
        break;
    }
  }

  // Extras de kyb_registry que viven en la raíz del result (no en el nodo):
  // fase del ciclo, datos declarados, candidatos y marca de selección.
  const envl = (check.result && typeof check.result === "object" ? check.result : {}) as Node;
  const isKyb = feature === "kyb_registry";
  const kybPhase = isKyb ? fmt(envl.phase) : "";
  const kybDeclared = isKyb ? (envl.declared as Node | undefined) : undefined;
  const kybSelected = isKyb ? (envl.selected as Node | undefined) : undefined;
  const kybCandidates = isKyb && Array.isArray(envl.candidates) ? envl.candidates : [];
  const kybBlocked = isKyb ? fmt(envl.autoSelectBlockedReason) : "";
  // Candidatos preliminares del ACK del search async: DIDIT puede adelantar
  // empresas con fetch_status pending antes de que la búsqueda resuelva.
  const kybSearchReg = isKyb
    ? (((envl.kyb_search as Node | undefined)?.kyb_registry ?? {}) as Node)
    : ({} as Node);
  const kybPreliminary =
    isKyb &&
    kybPhase === "search" &&
    check.status === "pending" &&
    Array.isArray(kybSearchReg.companies)
      ? (kybSearchReg.companies as Record<string, unknown>[])
      : [];
  // El picker solo aparece en candidate_selection y ANTES de cualquier intento
  // de select (un intento, aunque incierto, bloquea el ciclo: pudo facturarse).
  const showKybPicker =
    isKyb &&
    check.status === "pending" &&
    kybPhase === "candidate_selection" &&
    kybCandidates.length > 0 &&
    kybSelected?.select_attempted !== true &&
    Boolean(requestId);

  return (
    <Card className="mb-2 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{title}</span>
        <StatusBadge status={amlToBadge(check.status)} />
        <span className="ml-auto text-xs text-muted">{check.provider}</span>
      </div>

      {/* Fase del ciclo kyb_registry (search → candidate_selection | select → completed) */}
      {isKyb && check.status === "error" ? (
        <p className="mb-2 text-xs text-muted">{t("kybErrorRetry")}</p>
      ) : (
        isKyb &&
        kybPhase &&
        t.has(`kybPhase_${kybPhase}`) && (
          <p className="mb-2 text-xs text-muted">{t(`kybPhase_${kybPhase}`)}</p>
        )
      )}
      {/* Motivo del fallo (cualquier check didit en error guarda result.error) */}
      {check.status === "error" && fmt(envl.error) && (
        <p className="mb-2 rounded-lg bg-danger/10 px-2 py-1 text-xs text-danger">
          {fmt(envl.error)}
        </p>
      )}

      {/* Resultados preliminares mientras la búsqueda resuelve (solo lectura) */}
      {kybPreliminary.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-foreground">{t("kybPreliminary")}</p>
          <p className="mb-1 text-xs text-muted">{t("kybPreliminaryHint")}</p>
          <div className="space-y-1">
            {kybPreliminary.slice(0, 5).map((c, i) => {
              const cand = (c ?? {}) as Node;
              return (
                <div key={i} className="rounded-lg border border-border p-2 text-xs opacity-80">
                  <div className="font-medium text-foreground">{fmt(cand.name) || "—"}</div>
                  <div className="text-muted">
                    {[
                      fmt(cand.registration_number),
                      fmt(cand.type),
                      fmt(cand.status),
                      fmt(cand.fetch_status),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(sectionTitle || fieldLabel) && (
        <details className="mb-2 rounded-lg bg-surface-2 px-2 py-1">
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
            {t("validationTrigger")}
          </summary>
          <dl className="mt-1 space-y-0.5 text-xs">
            {sectionTitle && (
              <div className="flex gap-2">
                <dt className="shrink-0 text-muted">{t("section")}:</dt>
                <dd className="min-w-0 break-words text-foreground">{sectionTitle}</dd>
              </div>
            )}
            {fieldLabel && (
              <div className="flex gap-2">
                <dt className="shrink-0 text-muted">{t("question")}:</dt>
                <dd className="min-w-0 break-words text-foreground">{fieldLabel}</dd>
              </div>
            )}
          </dl>
        </details>
      )}

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
          {isKyb && kybDeclared && <KybDeclaredBlock declared={kybDeclared} node={node} cf={cf} t={t} />}
          {isKyb && node && <KybRegistryPeople node={node} cf={cf} />}
          {isKyb && envl.reason === "no_candidates" && (
            <p className="mt-2 text-xs text-muted">{t("kybNoCandidates")}</p>
          )}
          {isKyb && envl.reason === "none_matched" && (
            <p className="mt-2 text-xs text-muted">{t("kybNoneMatchedInfo")}</p>
          )}
          {isKyb && envl.reason === "superseded" && (
            <p className="mt-2 text-xs text-muted">{t("kybSuperseded")}</p>
          )}
          {showKybPicker && kybBlocked && t.has(`kybBlocked_${kybBlocked}`) && (
            <p className="mt-2 text-xs text-muted">{t(`kybBlocked_${kybBlocked}`)}</p>
          )}
          {isKyb && fmt(envl.select_error) && (
            <p className="mt-2 text-xs text-danger">{fmt(envl.select_error)}</p>
          )}
          {/* Intento de select sin confirmación: pudo facturarse — sin reintentos */}
          {isKyb &&
            check.status === "pending" &&
            kybSelected?.select_attempted === true &&
            kybSelected.billing_state === "unknown" && (
              <div className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
                {t("kybAttemptedInfo")}
              </div>
            )}
          {showKybPicker && requestId && (
            <KybCandidatePicker
              checkId={check.id}
              requestId={requestId}
              candidates={kybCandidates
                .map((c) => {
                  const cand = (c ?? {}) as Node;
                  return {
                    kyb_response_id: String(cand.kyb_response_id ?? ""),
                    name: fmt(cand.name),
                    registration_number: fmt(cand.registration_number),
                    status: fmt(cand.status),
                    type: fmt(cand.type),
                    fetch_status: fmt(cand.fetch_status),
                    match_reason: fmt(cand.match_reason),
                  };
                })
                .filter((c) => c.kyb_response_id)}
            />
          )}
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

// Normalizadores para la comparación declarado vs registro oficial.
function normNameCmp(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function normRegCmp(s: string): string {
  return s.toUpperCase().replace(/[\s.\-\/]+/g, "");
}

type KybVerdict = "exact" | "different" | "review";

/**
 * "Información declarada" (lo que ingresó el solicitante) y comparación
 * compacta contra el registro oficial cuando ya hay perfil (select hecho).
 */
function KybDeclaredBlock({
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
  const decName = fmt(declared.name);
  const decReg = fmt(declared.registration_number);
  const decCountry = fmt(declared.country);
  const rows = [
    { label: cf("companyName"), value: decName },
    { label: cf("regNumber"), value: decReg },
    { label: cf("registryCountry"), value: decCountry },
  ].filter((r) => r.value);
  if (!rows.length) return null;

  const cmp: { label: string; verdict: KybVerdict }[] = [];
  if (node) {
    const offName = fmt(node.company_name);
    const offReg = fmt(node.registration_number);
    const offCountry = fmt(node.country_code);
    if (decName && offName) {
      cmp.push({
        label: cf("companyName"),
        verdict: normNameCmp(decName) === normNameCmp(offName) ? "exact" : "review",
      });
    }
    if (decReg && offReg) {
      cmp.push({
        label: cf("regNumber"),
        verdict: normRegCmp(decReg) === normRegCmp(offReg) ? "exact" : "different",
      });
    }
    if (decCountry && offCountry) {
      cmp.push({
        label: cf("registryCountry"),
        verdict: decCountry.toUpperCase() === offCountry.toUpperCase() ? "exact" : "different",
      });
    }
  }
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
                key={c.label}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${verdictCls[c.verdict]}`}
              >
                {c.label}: {verdictLabel[c.verdict]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Directivos y beneficiarios finales del perfil registral (kyb_registry). */
function KybRegistryPeople({ node, cf }: { node: Node; cf: (k: string) => string }) {
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

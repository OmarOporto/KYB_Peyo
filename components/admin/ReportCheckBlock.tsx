import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DocPreview } from "@/components/admin/DocPreview";
import {
  AmlHits,
  CuratedFields,
  KybDeclaredBlock,
  KybRegistryPeople,
  Meter,
  Warnings,
  type CheckImage,
} from "@/components/admin/checkParts";
import {
  amlToBadge,
  envelopeOf,
  fmt,
  nodeOf,
  RISK_FEATURES,
  scoreLabelKey,
  type AmlCheckRow,
  type Node,
} from "@/lib/didit/summary";

/**
 * Verificación DIDIT tal y como aparece en el informe: bajo la pregunta que la
 * disparó y sin nada colapsado ni accionable. Un `<details>` cerrado no se
 * imprime, así que todo lo que es evidencia va abierto; el picker de candidatos
 * y la respuesta cruda se quedan en la vista operativa (`AmlCheckCard`).
 */
export async function ReportCheckBlock({
  check,
  image,
  refImages,
}: {
  check: AmlCheckRow;
  image?: CheckImage;
  refImages?: CheckImage[];
}) {
  const t = await getTranslations("admin");
  const tB = await getTranslations("builder");
  const tR = await getTranslations("report");

  const feature = check.feature;
  const featureKey = feature ? `didit_${feature}` : null;
  const title = featureKey && tB.has(featureKey) ? tB(featureKey) : t("amlResult");
  const node = nodeOf(feature, check.result);
  const risk = feature ? RISK_FEATURES.has(feature) : false;
  const cf = (k: string) => t(`checkFields.${k}`);

  const envl = envelopeOf(check.result);
  const isKyb = feature === "kyb_registry";
  const kybPhase = isKyb ? fmt(envl.phase) : "";
  const kybDeclared = isKyb ? (envl.declared as Node | undefined) : undefined;

  return (
    <div className="print-block mt-2 rounded-lg border border-border border-l-2 border-l-brand bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          {tR("diditBlock")}
        </span>
        <span className="text-sm font-medium text-foreground">{title}</span>
        <StatusBadge status={amlToBadge(check.status)} />
      </div>

      {/* Fase del ciclo kyb_registry: un perfil registral incompleto tiene que
          quedar explícito en el informe, no ausente. */}
      {isKyb && kybPhase && t.has(`kybPhase_${kybPhase}`) && (
        <p className="mb-2 text-xs text-muted">{t(`kybPhase_${kybPhase}`)}</p>
      )}
      {check.status === "error" && fmt(envl.error) && (
        <p className="mb-2 rounded-lg bg-danger/10 px-2 py-1 text-xs text-danger">
          {fmt(envl.error)}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {image?.url && (
          <div className="shrink-0">
            <p className="mb-1 text-xs text-muted">{cf("imageUsed")}</p>
            <DocPreview path={image.path} filename={image.filename} url={image.url} />
          </div>
        )}
        {refImages?.map((im, i) => (
          <div key={i} className="shrink-0">
            <p className="mb-1 text-xs text-muted">{cf("refImage")}</p>
            <DocPreview path={im.path} filename={im.filename} url={im.url} />
          </div>
        ))}
        <div className="min-w-0 flex-1">
          {typeof check.score === "number" && (
            <Meter value={check.score} risk={risk} label={cf(scoreLabelKey(feature))} />
          )}
          <CuratedFields feature={feature} node={node} cf={cf} />
          {feature === "aml_screening" && node && <AmlHits node={node} />}
          {isKyb && kybDeclared && (
            <KybDeclaredBlock declared={kybDeclared} node={node} cf={cf} t={t} />
          )}
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
          {node && <Warnings node={node} />}
        </div>
      </div>
    </div>
  );
}

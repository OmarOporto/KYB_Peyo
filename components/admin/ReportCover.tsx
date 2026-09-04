import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/Brand";
import { amlToBadge, type AmlCheckRow } from "@/lib/didit/summary";

/**
 * Portada del informe, al estilo del PDF de DIDIT: fondo a sangre, el nombre
 * del sujeto en grande y una fila de chips con las verificaciones y su estado.
 *
 * Solo se imprime (`hidden print:block`): en pantalla el analista quiere entrar
 * directo al contenido, no pasar por una carátula.
 */
export async function ReportCover({
  subject,
  externalRef,
  requestId,
  status,
  checks,
}: {
  /** Nombre detectado de las verificaciones, o la referencia como respaldo. */
  subject: string;
  externalRef: string;
  requestId: string;
  status: string;
  checks: AmlCheckRow[];
}) {
  const t = await getTranslations("report");
  const tStatus = await getTranslations("status");
  const tB = await getTranslations("builder");

  return (
    <section className="report-cover hidden print:block">
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-6">
          {/* El wordmark es navy: sobre el azul necesita el chip claro que Brand
              ya usa en modo oscuro, aquí forzado con la clase. */}
          <Brand size="lg" className="bg-white/90" />
          <CoverStatus status={status} label={tStatus.has(status) ? tStatus(status) : status} />
        </div>

        <div>
          <h1 className="font-display text-[52px] leading-[1.05] font-bold tracking-tight text-white">
            {subject}
          </h1>
          <p className="font-display text-[52px] leading-[1.05] font-bold tracking-tight text-white/45">
            {t("coverSubtitle")}
          </p>
        </div>

        <div>
          {checks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {checks.map((c) => {
                const key = c.feature ? `didit_${c.feature}` : null;
                return (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-white/90"
                  >
                    {key && tB.has(key) ? tB(key) : c.provider}
                    <CoverDot status={c.status} />
                  </span>
                );
              })}
            </div>
          )}
          <p className="mt-8 text-right text-[11px] text-white/50">
            {t("requestLabel")}: {externalRef}
          </p>
          <p className="text-right text-[11px] text-white/35">{requestId}</p>
        </div>
      </div>
    </section>
  );
}

/** Píldora de estado de la solicitud, sobre fondo azul. */
function CoverStatus({ status, label }: { status: string; label: string }) {
  const tone =
    status === "approved"
      ? "bg-emerald-400/20 text-emerald-200"
      : status === "rejected"
        ? "bg-red-400/20 text-red-200"
        : status === "changes_requested" || status === "under_review"
          ? "bg-amber-400/20 text-amber-200"
          : "bg-white/15 text-white/80";
  return (
    <span
      className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

/** Punto de estado del chip; reutiliza el mapeo de estados de los checks. */
function CoverDot({ status }: { status: string }) {
  const badge = amlToBadge(status);
  const color =
    badge === "approved"
      ? "bg-emerald-400"
      : badge === "rejected"
        ? "bg-red-400"
        : badge === "expired"
          ? "bg-white/40"
          : "bg-amber-400";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

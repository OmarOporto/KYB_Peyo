"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCost } from "@/lib/i18n-ai/pricing";
import type { ChargeSummary, PeriodTotal } from "@/lib/didit/pricing";
import type { DiditBalance } from "@/lib/didit/costs";
import { syncDiditChargesAction } from "./actions";

/** Por debajo de esto el saldo alcanza para pocas decenas de verificaciones. */
const LOW_BALANCE_USD = 10;

/** `≈ US$ 2.50` cuando algún monto sale de una tarifa y no de DIDIT. */
function money(p: { amount: number; estimated: boolean }): string {
  return `${p.estimated ? "≈ " : ""}${formatCost(p.amount)}`;
}

/**
 * Cobros de DIDIT. El admin ve montos, saldo y el botón de sincronizar; un
 * miembro ve solo cantidades (el costo es la tarifa del proveedor a la
 * plataforma, igual que en IA).
 */
export function DiditPanel({
  summary,
  isAdmin,
  balance,
  featureLabels,
  formNames,
}: {
  summary: ChargeSummary;
  isAdmin: boolean;
  /** `undefined` para un miembro; `null` si DIDIT no respondió. */
  balance?: DiditBalance | null;
  featureLabels: Record<string, string>;
  formNames: Record<string, string>;
}) {
  const t = useTranslations("aiUsage");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    setError(null);
    const res = await syncDiditChargesAction();
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const { diditUnreachable, ...counts } = res.result;
    setMsg(t("syncDone", counts));
    if (diditUnreachable) setError(t("syncUnreachable"));
  }

  const lineLabel = (line: string) =>
    line === "kyb_search" || line === "kyb_select" ? t(`line_${line}`) : (featureLabels[line] ?? line);
  const anyEstimated = summary.all.estimated;
  const cards: { label: string; p: PeriodTotal }[] = [
    { label: t("thisMonth"), p: summary.month },
    { label: t("last30"), p: summary.last30 },
    { label: t("allTime"), p: summary.all },
  ];

  return (
    <>
      <div className={`mb-4 grid gap-3 ${isAdmin ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
        {cards.map(({ label, p }) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-semibold uppercase text-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {isAdmin ? money(p) : p.count}
            </p>
            <p className="mt-1 text-xs text-muted">
              {isAdmin ? t("chargesCount", { count: p.count }) : t("verificationsLabel")}
            </p>
          </Card>
        ))}
        {isAdmin && (
          <Card
            className={`p-4 ${
              balance && balance.balance < LOW_BALANCE_USD ? "border-warning/60 bg-warning/10" : ""
            }`}
          >
            <p className="text-xs font-semibold uppercase text-muted">{t("diditBalance")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {balance ? formatCost(balance.balance) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {!balance
                ? t("diditBalanceUnavailable")
                : balance.balance < LOW_BALANCE_USD
                  ? t("diditBalanceLow")
                  : t("diditBalanceHint")}
              {balance && !balance.autoRefill && <> · {t("diditAutoRefillOff")}</>}
            </p>
            <a
              href="https://business.didit.me"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs font-medium text-brand hover:underline"
            >
              {t("diditTopUp")}
            </a>
          </Card>
        )}
      </div>

      <Card className="mb-4 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">{t("byVerification")}</p>
        {summary.lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("diditEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-lg text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3 font-medium">{t("colFeature")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colChargedMonth")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colChargedTotal")}</th>
                  {isAdmin && (
                    <>
                      <th className="py-2 pr-3 text-right font-medium">{t("colUnit")}</th>
                      <th className="py-2 pr-3 text-right font-medium">{t("colThisMonth")}</th>
                      <th className="py-2 text-right font-medium">{t("colTotal")}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((l) => (
                  <tr key={l.line} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">{lineLabel(l.line)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.month.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.total.count}</td>
                    {isAdmin && (
                      <>
                        <td className="py-2 pr-3 text-right text-xs tabular-nums text-muted">
                          {l.unit == null
                            ? "—"
                            : money({ amount: l.unit, estimated: l.total.estimated })}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{money(l.month)}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{money(l.total)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              {isAdmin && (
                <tfoot>
                  <tr className="border-t border-border text-sm font-semibold">
                    <td className="py-2 pr-3">{t("colTotal")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{summary.month.count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{summary.all.count}</td>
                    <td />
                    <td className="py-2 pr-3 text-right tabular-nums">{money(summary.month)}</td>
                    <td className="py-2 text-right tabular-nums">{money(summary.all)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {isAdmin && anyEstimated && (
          <p className="mt-3 text-xs text-muted">{t("estimatedLegend")}</p>
        )}
      </Card>

      {isAdmin && summary.forms.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="mb-1 text-sm font-medium text-foreground">{t("byForm")}</p>
          <p className="mb-3 text-xs text-muted">{t("byFormHint")}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-lg text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3 font-medium">{t("colForm")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colRequests")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colAvg")}</th>
                  <th className="py-2 text-right font-medium">{t("colTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.forms.map((f) => (
                  <tr key={f.formId ?? "none"} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      {(f.formId && formNames[f.formId]) || t("formUnknown")}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.requests}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {money({ amount: f.avgPerRequest, estimated: f.estimated })}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {money({ amount: f.total, estimated: f.estimated })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isAdmin && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={busy} onClick={sync}>
            {busy ? t("syncing") : t("sync")}
          </Button>
          <p className="text-xs text-muted">
            {summary.lastSyncedAt
              ? t("lastSync", {
                  when: new Date(summary.lastSyncedAt).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                })
              : t("neverSynced")}
            {summary.pending > 0 && <> · {t("pendingNote", { count: summary.pending })}</>}
          </p>
          {msg && <p className="w-full text-xs text-success">{msg}</p>}
          {error && <p className="w-full text-xs text-danger">{error}</p>}
        </div>
      )}
    </>
  );
}

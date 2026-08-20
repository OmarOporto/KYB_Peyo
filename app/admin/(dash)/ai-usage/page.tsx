import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/Card";
import { DEFAULT_PRICES, formatCost, formatTokens } from "@/lib/i18n-ai/pricing";
import { PricesPanel, type PriceRow } from "./PricesPanel";

export const dynamic = "force-dynamic";

/** Tope de filas leídas. Suficiente para el historial visible sin paginar. */
const MAX_ROWS = 1000;

type UsageRow = {
  run_id: string;
  operation: string;
  provider: string;
  model: string;
  to_locale: string | null;
  items: number;
  items_returned: number;
  input_tokens: number;
  output_tokens: number;
  cost: string | number | null;
  currency: string;
  actor: string;
  form_id: string | null;
  request_id: string | null;
  created_at: string;
};

type Run = {
  runId: string;
  operation: string;
  provider: string;
  model: string;
  toLocale: string | null;
  calls: number;
  items: number;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  currency: string;
  actor: string;
  formId: string | null;
  requestId: string | null;
  at: string;
};

export default async function AiUsagePage() {
  await requireAnalyst();
  const t = await getTranslations("aiUsage");

  const supabase = createServiceClient();
  const [{ data: usage }, { data: prices }] = await Promise.all([
    supabase
      .from("ai_usage")
      .select(
        "run_id, operation, provider, model, to_locale, items, items_returned, input_tokens, output_tokens, cost, currency, actor, form_id, request_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
    supabase
      .from("ai_model_prices")
      .select("model, input_per_1m, output_per_1m, currency, updated_at, updated_by")
      .order("model"),
  ]);

  const rows = (usage ?? []) as UsageRow[];

  // Agrupado por corrida: traducir un formulario son N llamadas por sección,
  // pero para quien lo mira es UNA operación.
  const byRun = new Map<string, Run>();
  for (const r of rows) {
    const cost = r.cost == null ? null : Number(r.cost);
    const acc = byRun.get(r.run_id);
    if (!acc) {
      byRun.set(r.run_id, {
        runId: r.run_id,
        operation: r.operation,
        provider: r.provider,
        model: r.model,
        toLocale: r.to_locale,
        calls: 1,
        items: r.items,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cost,
        currency: r.currency,
        actor: r.actor,
        formId: r.form_id,
        requestId: r.request_id,
        at: r.created_at,
      });
      continue;
    }
    acc.calls += 1;
    acc.items += r.items;
    acc.inputTokens += r.input_tokens;
    acc.outputTokens += r.output_tokens;
    if (cost != null) acc.cost = (acc.cost ?? 0) + cost;
    acc.formId ??= r.form_id;
    acc.requestId ??= r.request_id;
  }
  const runs = [...byRun.values()];

  // El proveedor mock no consume tokens ni cuesta: se excluye del dinero para
  // que desarrollar no ensucie las cifras.
  const billable = rows.filter((r) => r.provider !== "mock");
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const since30 = new Date(now);
  since30.setDate(since30.getDate() - 30);

  const sum = (list: UsageRow[]) => ({
    cost: list.reduce((n, r) => n + (r.cost == null ? 0 : Number(r.cost)), 0),
    inputTokens: list.reduce((n, r) => n + r.input_tokens, 0),
    outputTokens: list.reduce((n, r) => n + r.output_tokens, 0),
    calls: list.length,
  });

  const totals = [
    { label: t("today"), ...sum(billable.filter((r) => new Date(r.created_at) >= startOfToday)) },
    { label: t("last30"), ...sum(billable.filter((r) => new Date(r.created_at) >= since30)) },
    { label: t("allTime"), ...sum(billable) },
  ];

  // Modelos conocidos por el código pero todavía sin fila en la tabla: se
  // muestran con su default para poder fijarlos antes de usarlos.
  const stored = new Map((prices ?? []).map((p) => [p.model as string, p]));
  const priceRows: PriceRow[] = [
    ...new Set([...stored.keys(), ...Object.keys(DEFAULT_PRICES)]),
  ]
    .sort()
    .map((model) => {
      const p = stored.get(model);
      const d = DEFAULT_PRICES[model];
      return {
        model,
        inputPer1M: p ? Number(p.input_per_1m) : (d?.inputPer1M ?? 0),
        outputPer1M: p ? Number(p.output_per_1m) : (d?.outputPer1M ?? 0),
        currency: (p?.currency as string) ?? d?.currency ?? "USD",
        updatedAt: (p?.updated_at as string | null) ?? null,
        updatedBy: (p?.updated_by as string | null) ?? null,
        stored: Boolean(p),
      };
    });

  const OP_HREF: Record<string, (r: Run) => string | null> = {
    form_translate: (r) => (r.formId ? `/admin/forms/${r.formId}/edit` : null),
    answer_translate: (r) => (r.requestId ? `/admin/requests/${r.requestId}` : null),
  };

  return (
    <main className="w-full p-6 xl:px-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>

      {/* Estas cifras se calculan con la tarifa cargada acá, no con la del
          proveedor: no contemplan descuentos por caché de prompt, cambios de
          precio no reflejados en la tabla, ni impuestos. Sirven para dimensionar
          el gasto, nunca para conciliar una factura. */}
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <span aria-hidden className="text-base leading-none">
          ⚠
        </span>
        <p className="text-sm text-foreground">
          {t("estimateWarning")}{" "}
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand hover:underline"
          >
            {t("estimateWarningLink")}
          </a>
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {totals.map((x) => (
          <Card key={x.label} className="p-4">
            <p className="text-xs font-semibold uppercase text-muted">{x.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{formatCost(x.cost)}</p>
            <p className="mt-1 text-xs text-muted">
              {formatTokens(x.inputTokens)} {t("in")} · {formatTokens(x.outputTokens)}{" "}
              {t("out")} · {x.calls} {t("calls")}
            </p>
          </Card>
        ))}
      </div>

      <Card className="mb-4 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">{t("runs")}</p>
        {runs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3 font-medium">{t("colWhen")}</th>
                  <th className="py-2 pr-3 font-medium">{t("colOperation")}</th>
                  <th className="py-2 pr-3 font-medium">{t("colModel")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colItems")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colTokens")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colCost")}</th>
                  <th className="py-2 font-medium">{t("colActor")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const href = OP_HREF[r.operation]?.(r) ?? null;
                  return (
                    <tr key={r.runId} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-xs text-muted">
                        {new Date(r.at).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-2 pr-3">
                        {href ? (
                          <Link href={href} className="text-brand hover:underline">
                            {t(`op_${r.operation}`)}
                          </Link>
                        ) : (
                          t(`op_${r.operation}`)
                        )}
                        {r.toLocale && (
                          <span className="ml-1 text-xs text-muted">
                            → {r.toLocale.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {r.model}
                        {r.provider === "mock" && (
                          <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-muted">
                            mock
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.items}
                        {r.calls > 1 && (
                          <span className="ml-1 text-xs text-muted">
                            ({r.calls} {t("calls")})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs tabular-nums text-muted">
                        {formatTokens(r.inputTokens)} / {formatTokens(r.outputTokens)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatCost(r.cost, r.currency)}
                      </td>
                      <td className="py-2 truncate text-xs text-muted">{r.actor}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PricesPanel rows={priceRows} />
    </main>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAnalyst } from "@/lib/auth/admin";
import { resolveListScope } from "@/lib/auth/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/Card";
import { OrgTabs } from "@/components/admin/OrgTabs";
import { DEFAULT_PRICES, formatCost, formatTokens } from "@/lib/i18n-ai/pricing";
import { summarizeCharges, type ChargeRow, type DiditChargeKind, type DiditChargeSource } from "@/lib/didit/pricing";
import { getDiditBalance } from "@/lib/didit/costs";
import { DIDIT_FEATURES } from "@/lib/forms/definition";
import { PricesPanel, type PriceRow } from "./PricesPanel";
import { DiditPanel } from "./DiditPanel";

export const dynamic = "force-dynamic";
// "Sincronizar con DIDIT" recorre sesiones y pide el costo de cada una.
export const maxDuration = 120;

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
  org_id: string;
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
  orgId: string;
  at: string;
};

type DiditChargeDbRow = {
  feature: string;
  kind: DiditChargeKind;
  amount: string | number | null;
  source: DiditChargeSource;
  request_id: string | null;
  created_at: string;
  synced_at: string | null;
  kyb_requests: { form_id: string | null } | { form_id: string | null }[] | null;
};

/**
 * Consumo de servicios pagos: traducciones con IA y verificaciones DIDIT.
 *
 * Un miembro ve el consumo de SU org en tokens y cantidad de verificaciones,
 * sin dinero: el costo es la tarifa del proveedor a la plataforma, no algo del
 * cliente. El admin ve el costo, las tarifas y una pestaña por org.
 */
export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const analyst = await requireAnalyst();
  const t = await getTranslations("aiUsage");
  const tBuilder = await getTranslations("builder");
  const { scope, orgs } = await resolveListScope(analyst, (await searchParams).org);
  const isAdmin = analyst.role === "admin";
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const showOrgColumn = isAdmin && !scope;

  // Service-role: el filtro de org va a mano (un miembro solo ve su consumo).
  const supabase = createServiceClient();
  let usageQuery = supabase
    .from("ai_usage")
    .select(
      "run_id, operation, provider, model, to_locale, items, items_returned, input_tokens, output_tokens, cost, currency, actor, form_id, request_id, org_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (scope) usageQuery = usageQuery.eq("org_id", scope);

  let diditQuery = supabase
    .from("didit_charges")
    .select("feature, kind, amount, source, request_id, created_at, synced_at, kyb_requests(form_id)")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (scope) diditQuery = diditQuery.eq("org_id", scope);

  const [{ data: usage }, { data: diditRows }, { data: prices }, balance] = await Promise.all([
    usageQuery,
    diditQuery,
    // Las tarifas son solo del admin (también por RLS, 0025).
    isAdmin
      ? supabase
          .from("ai_model_prices")
          .select("model, input_per_1m, output_per_1m, currency, updated_at, updated_by")
          .order("model")
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // Saldo real de la cuenta: dato de la plataforma, solo para el admin.
    isAdmin ? getDiditBalance() : Promise.resolve(undefined),
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
        orgId: r.org_id,
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

  // El proveedor mock no consume tokens ni cuesta: se excluye de los totales
  // para que desarrollar no ensucie las cifras.
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

  // Cobros DIDIT: por período, por verificación y por formulario.
  const charges: ChargeRow[] = ((diditRows ?? []) as DiditChargeDbRow[]).map((r) => {
    const req = Array.isArray(r.kyb_requests) ? r.kyb_requests[0] : r.kyb_requests;
    return {
      feature: r.feature,
      kind: r.kind,
      amount: r.amount == null ? null : Number(r.amount),
      source: r.source,
      requestId: r.request_id,
      formId: req?.form_id ?? null,
      createdAt: r.created_at,
      syncedAt: r.synced_at,
    };
  });
  const diditSummary = summarizeCharges(charges, now);
  const featureLabels = Object.fromEntries(
    DIDIT_FEATURES.map((f) => [f, tBuilder.has(`didit_${f}`) ? tBuilder(`didit_${f}`) : f]),
  );
  const formIds = diditSummary.forms.map((f) => f.formId).filter((id): id is string => Boolean(id));
  const { data: formRows } = isAdmin && formIds.length
    ? await supabase.from("forms").select("id, name").in("id", formIds)
    : { data: [] as { id: string; name: string }[] };
  const formNames = Object.fromEntries((formRows ?? []).map((f) => [f.id as string, f.name as string]));

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
      <p className="mb-4 text-sm text-muted">{isAdmin ? t("subtitle") : t("subtitleMember")}</p>

      {isAdmin && (
        <OrgTabs
          orgs={orgs}
          active={scope}
          hrefFor={(orgId) => (orgId ? `/admin/ai-usage?org=${orgId}` : "/admin/ai-usage")}
        />
      )}

      {/* Estas cifras se calculan con la tarifa cargada acá, no con la del
          proveedor: no contemplan descuentos por caché de prompt, cambios de
          precio no reflejados en la tabla, ni impuestos. Sirven para dimensionar
          el gasto, nunca para conciliar una factura. */}
      {isAdmin && (
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
      )}

      <h2 className="mb-2 font-display text-lg font-semibold text-foreground">{t("aiTitle")}</h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {totals.map((x) => (
          <Card key={x.label} className="p-4">
            <p className="text-xs font-semibold uppercase text-muted">{x.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {isAdmin
                ? formatCost(x.cost)
                : `${formatTokens(x.inputTokens + x.outputTokens)} ${t("tokens")}`}
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatTokens(x.inputTokens)} {t("in")} · {formatTokens(x.outputTokens)}{" "}
              {t("out")} · {x.calls} {t("calls")}
            </p>
          </Card>
        ))}
      </div>

      <Card className="mb-6 p-4">
        <p className="mb-3 text-sm font-medium text-foreground">{t("runs")}</p>
        {runs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3 font-medium">{t("colWhen")}</th>
                  {showOrgColumn && <th className="py-2 pr-3 font-medium">{t("colOrg")}</th>}
                  <th className="py-2 pr-3 font-medium">{t("colOperation")}</th>
                  <th className="py-2 pr-3 font-medium">{t("colModel")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colItems")}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t("colTokens")}</th>
                  {isAdmin && (
                    <th className="py-2 pr-3 text-right font-medium">{t("colCost")}</th>
                  )}
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
                      {showOrgColumn && (
                        <td className="py-2 pr-3 text-xs">{orgName.get(r.orgId) ?? "—"}</td>
                      )}
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
                      {isAdmin && (
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatCost(r.cost, r.currency)}
                        </td>
                      )}
                      <td className="py-2 truncate text-xs text-muted">{r.actor}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Tarifas de IA junto a su sección: debajo de DIDIT se leían como suyas. */}
      {isAdmin && (
        <div className="mb-6">
          <PricesPanel rows={priceRows} />
        </div>
      )}

      <h2 className="mb-1 font-display text-lg font-semibold text-foreground">
        {t("diditTitle")}
      </h2>
      <p className="mb-2 text-sm text-muted">{isAdmin ? t("diditHint") : t("diditHintMember")}</p>
      <DiditPanel
        summary={diditSummary}
        isAdmin={isAdmin}
        balance={balance}
        featureLabels={featureLabels}
        formNames={formNames}
      />

    </main>
  );
}

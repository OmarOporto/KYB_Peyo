"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { setModelPriceAction } from "./actions";

export type PriceRow = {
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  currency: string;
  updatedAt: string | null;
  updatedBy: string | null;
  /** `false` = todavía es el default del código, sin fila propia en la tabla. */
  stored: boolean;
};

const input =
  "w-28 rounded-lg border border-border bg-surface px-2 py-1 text-sm tabular-nums text-foreground outline-none focus:border-brand disabled:opacity-60";

export function PricesPanel({ rows }: { rows: PriceRow[] }) {
  const t = useTranslations("aiUsage");
  const [draft, setDraft] = useState<Record<string, { in: string; out: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function valueOf(r: PriceRow, key: "in" | "out"): string {
    const d = draft[r.model];
    if (d) return key === "in" ? d.in : d.out;
    return String(key === "in" ? r.inputPer1M : r.outputPer1M);
  }

  function edit(r: PriceRow, key: "in" | "out", value: string) {
    setDraft((prev) => ({
      ...prev,
      [r.model]: {
        in: key === "in" ? value : valueOf(r, "in"),
        out: key === "out" ? value : valueOf(r, "out"),
      },
    }));
  }

  async function save(r: PriceRow) {
    setBusy(r.model);
    setError(null);
    setMsg(null);
    const res = await setModelPriceAction(
      r.model,
      Number(valueOf(r, "in")),
      Number(valueOf(r, "out")),
    );
    setBusy(null);
    if (res.ok) {
      setDraft((prev) => {
        const next = { ...prev };
        delete next[r.model];
        return next;
      });
      setMsg(`${r.model}: ${t("priceSaved")}`);
    } else {
      setError(res.error);
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-1 text-sm font-medium text-foreground">{t("prices")}</p>
      <p className="mb-3 text-xs text-muted">{t("pricesHint")}</p>

      {msg && <p className="mb-2 text-xs text-success">{msg}</p>}
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted">
              <th className="py-2 pr-3 font-medium">{t("colModel")}</th>
              <th className="py-2 pr-3 font-medium">{t("colInPrice")}</th>
              <th className="py-2 pr-3 font-medium">{t("colOutPrice")}</th>
              <th className="py-2 pr-3 font-medium">{t("colUpdated")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dirty = Boolean(draft[r.model]);
              return (
                <tr key={r.model} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">
                    {r.model}
                    {!r.stored && (
                      <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                        {t("fromDefaults")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className={input}
                      type="number"
                      step="0.0001"
                      min="0"
                      value={valueOf(r, "in")}
                      onChange={(e) => edit(r, "in", e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      className={input}
                      type="number"
                      step="0.0001"
                      min="0"
                      value={valueOf(r, "out")}
                      onChange={(e) => edit(r, "out", e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">
                    {r.updatedAt
                      ? `${new Date(r.updatedAt).toLocaleDateString()}${r.updatedBy ? ` · ${r.updatedBy}` : ""}`
                      : "—"}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!dirty || busy === r.model}
                      onClick={() => save(r)}
                    >
                      {busy === r.model ? "…" : t("save")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

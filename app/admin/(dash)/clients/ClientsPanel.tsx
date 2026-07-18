"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  rotateApiKeyAction,
  setRateLimitAction,
} from "./actions";

export type ClientRow = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  today: number;
  total: number;
  rateLimit: number | null; // null = usa el default global
  revoked: boolean;
};

export function ClientsPanel({
  rows,
  defaultLimit,
}: {
  rows: ClientRow[];
  defaultLimit: number;
}) {
  const t = useTranslations("clients");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null); // texto plano una vez
  const [label, setLabel] = useState("");
  const [newLimit, setNewLimit] = useState("");

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
      return res;
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!label.trim()) return;
    const limit = newLimit.trim() ? Number(newLimit) : null;
    const res = await run(() => createApiKeyAction(label.trim(), limit));
    if (res.ok && "apiKey" in res) {
      setNewKey(res.apiKey as string);
      setLabel("");
      setNewLimit("");
    }
  }

  return (
    <>
      {/* Alta de cliente */}
      <Card className="mb-4 p-4">
        <p className="mb-2 text-sm font-medium text-foreground">{t("newClient")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs text-muted">
            {t("clientName")}
            <input
              className="mt-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("clientNamePlaceholder")}
            />
          </label>
          <label className="flex flex-col text-xs text-muted">
            {t("rateLimitOptional", { default: defaultLimit })}
            <input
              type="number"
              min={1}
              className="mt-1 w-32 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder={String(defaultLimit)}
            />
          </label>
          <Button size="sm" onClick={onCreate} disabled={busy || !label.trim()}>
            {t("create")}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("colClient")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colUsage")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colLastUsed")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colLimit")}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ClientRowView key={r.id} row={r} defaultLimit={defaultLimit} onRun={run} onKey={setNewKey} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: mostrar la key en claro una sola vez */}
      {newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg p-5">
            <h2 className="font-display text-lg font-bold text-foreground">{t("keyOnceTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("keyOnceBody")}</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground">
                {newKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(newKey)}
              >
                {t("copy")}
              </Button>
            </div>
            <div className="mt-4 text-right">
              <Button size="sm" onClick={() => setNewKey(null)}>
                {t("done")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function ClientRowView({
  row,
  defaultLimit,
  onRun,
  onKey,
}: {
  row: ClientRow;
  defaultLimit: number;
  onRun: <T extends { ok: boolean; error?: string }>(fn: () => Promise<T>) => Promise<T>;
  onKey: (k: string) => void;
}) {
  const t = useTranslations("clients");
  const [limit, setLimit] = useState(row.rateLimit != null ? String(row.rateLimit) : "");

  return (
    <tr className={`border-t border-border ${row.revoked ? "opacity-50" : "hover:bg-surface-2"}`}>
      <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
      <td className="px-4 py-2.5">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.revoked ? "bg-danger/15 text-danger" : "bg-success/15 text-success"
          }`}
        >
          {row.revoked ? t("revoked") : t("active")}
        </span>
      </td>
      <td className="px-4 py-2.5 text-muted">
        {t("usageCell", { today: row.today, total: row.total })}
      </td>
      <td className="px-4 py-2.5 text-muted">
        {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString() : "—"}
      </td>
      <td className="px-4 py-2.5">
        {row.revoked ? (
          <span className="text-muted">
            {row.rateLimit ?? `${defaultLimit} (${t("default")})`}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder={`${defaultLimit}`}
              className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-brand"
            />
            <button
              type="button"
              className="text-xs text-brand hover:underline"
              onClick={() =>
                onRun(() => setRateLimitAction(row.id, limit.trim() ? Number(limit) : null))
              }
            >
              {t("save")}
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <Link
          href={`/admin/clients/${row.id}/webhooks`}
          className="text-xs text-brand hover:underline"
        >
          {t("webhooks")}
        </Link>
        {!row.revoked && (
          <>
            <button
              type="button"
              className="ml-3 text-xs text-brand hover:underline"
              onClick={async () => {
                const res = await onRun(() => rotateApiKeyAction(row.id));
                if (res.ok && "apiKey" in res) onKey((res as { apiKey: string }).apiKey);
              }}
            >
              {t("rotate")}
            </button>
            <button
              type="button"
              className="ml-3 text-xs text-danger hover:underline"
              onClick={() => {
                if (confirm(t("confirmRevoke"))) onRun(() => revokeApiKeyAction(row.id));
              }}
            >
              {t("revoke")}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

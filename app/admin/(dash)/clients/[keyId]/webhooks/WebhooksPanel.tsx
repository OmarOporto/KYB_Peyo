"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  createWebhookEndpointAction,
  rotateWebhookSecretAction,
  setWebhookEnabledAction,
} from "../../webhookActions";

export type WebhookRow = {
  id: string;
  url: string;
  secretLast4: string | null;
  enabled: boolean;
  createdAt: string;
};

export function WebhooksPanel({
  apiKeyId,
  rows,
}: {
  apiKeyId: string;
  rows: WebhookRow[];
}) {
  const t = useTranslations("webhooks");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

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
    if (!url.trim()) return;
    const res = await run(() => createWebhookEndpointAction(apiKeyId, url.trim()));
    if (res.ok && "secret" in res) {
      setSecret(res.secret as string);
      setUrl("");
    }
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <p className="mb-2 text-sm font-medium text-foreground">{t("newEndpoint")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col text-xs text-muted">
            {t("url")}
            <input
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://cliente.com/kyb-webhook"
            />
          </label>
          <Button size="sm" onClick={onCreate} disabled={busy || !url.trim()}>
            {t("register")}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">{t("httpsOnly")}</p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("colUrl")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colSecret")}</th>
                <th className="px-4 py-2.5 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 break-all text-foreground">{r.url}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {r.secretLast4 ? `…${r.secretLast4}` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.enabled ? "bg-success/15 text-success" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {r.enabled ? t("enabled") : t("disabled")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="text-xs text-brand hover:underline"
                      onClick={() => navigator.clipboard?.writeText(r.id)}
                      title={r.id}
                    >
                      {t("copyId")}
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-xs text-brand hover:underline"
                      onClick={async () => {
                        const res = await run(() => rotateWebhookSecretAction(r.id, apiKeyId));
                        if (res.ok && "secret" in res) setSecret((res as { secret: string }).secret);
                      }}
                    >
                      {t("rotate")}
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-xs text-muted hover:underline"
                      onClick={() => run(() => setWebhookEnabledAction(r.id, apiKeyId, !r.enabled))}
                    >
                      {r.enabled ? t("disable") : t("enable")}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {secret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg p-5">
            <h2 className="font-display text-lg font-bold text-foreground">{t("secretOnceTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("secretOnceBody")}</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground">
                {secret}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(secret)}
              >
                {t("copy")}
              </Button>
            </div>
            <div className="mt-4 text-right">
              <Button size="sm" onClick={() => setSecret(null)}>
                {t("done")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

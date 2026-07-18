"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { rotateApiKeyAction, setDefaultFormAction } from "../../actions";

export type IntegrationForm = { id: string; name: string };

export function IntegrationConfig({
  apiKeyId,
  baseUrl,
  keyPrefix,
  forms,
  defaultFormId,
  endpointIds,
}: {
  apiKeyId: string;
  baseUrl: string;
  keyPrefix: string | null;
  forms: IntegrationForm[];
  defaultFormId: string | null;
  endpointIds: string[];
}) {
  const t = useTranslations("integration");
  const [formId, setFormId] = useState(defaultFormId ?? "");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, label: string) {
    navigator.clipboard?.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
  }

  async function onSelectForm(v: string) {
    setFormId(v);
    setBusy(true);
    await setDefaultFormAction(apiKeyId, v || null);
    setBusy(false);
  }

  async function onRotate() {
    setBusy(true);
    const res = await rotateApiKeyAction(apiKeyId);
    setBusy(false);
    if (res.ok && "apiKey" in res) setNewKey(res.apiKey as string);
  }

  const envBlock = [
    `KYB_BASE_URL=${baseUrl}`,
    `KYB_API_KEY=${t("placeholderKey")}`,
    `KYB_FORM_ID=${formId || t("placeholderForm")}`,
    `KYB_WEBHOOK_ENDPOINT_ID=${endpointIds[0] ?? t("placeholderEndpoint")}`,
    `KYB_WEBHOOK_SECRET=${t("placeholderSecret")}`,
  ].join("\n");

  return (
    <Card className="mb-4 p-4">
      <p className="mb-3 text-sm font-medium text-foreground">{t("title")}</p>

      <div className="space-y-2 text-sm">
        <ConfigRow label="KYB_BASE_URL" value={baseUrl} copiedLabel={copied} onCopy={() => copy(baseUrl, "KYB_BASE_URL")} copyText={t("copy")} copiedText={t("copied")} />

        <ConfigRow
          label="KYB_API_KEY"
          value={keyPrefix ? `${keyPrefix}…` : "—"}
          note={t("keyNote")}
          extra={
            <button
              type="button"
              className="text-xs text-brand hover:underline disabled:opacity-50"
              onClick={onRotate}
              disabled={busy}
            >
              {t("rotateCopy")}
            </button>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-52 shrink-0 font-mono text-xs text-muted">KYB_FORM_ID</span>
          <select
            value={formId}
            onChange={(e) => onSelectForm(e.target.value)}
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus:border-brand"
          >
            <option value="">{t("selectForm")}</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {formId && (
            <button
              type="button"
              className="text-xs text-brand hover:underline"
              onClick={() => copy(formId, "KYB_FORM_ID")}
            >
              {copied === "KYB_FORM_ID" ? t("copied") : t("copy")}
            </button>
          )}
        </div>

        <ConfigRow
          label="KYB_WEBHOOK_ENDPOINT_ID"
          value={endpointIds[0] ?? "—"}
          note={
            endpointIds.length > 1
              ? t("multipleEndpoints")
              : endpointIds.length === 0
                ? t("endpointNote")
                : undefined
          }
          copiedLabel={copied}
          onCopy={endpointIds[0] ? () => copy(endpointIds[0], "KYB_WEBHOOK_ENDPOINT_ID") : undefined}
          copyText={t("copy")}
          copiedText={t("copied")}
        />

        <ConfigRow label="KYB_WEBHOOK_SECRET" value="••••••••" note={t("secretNote")} />
      </div>

      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={() => copy(envBlock, "env")}>
          {copied === "env" ? t("copied") : t("copyEnv")}
        </Button>
      </div>

      {newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg p-5">
            <h2 className="font-display text-lg font-bold text-foreground">{t("keyOnceTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("keyOnceBody")}</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground">
                {newKey}
              </code>
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(newKey)}>
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
    </Card>
  );
}

function ConfigRow({
  label,
  value,
  note,
  extra,
  onCopy,
  copiedLabel,
  copyText,
  copiedText,
}: {
  label: string;
  value: string;
  note?: string;
  extra?: React.ReactNode;
  onCopy?: () => void;
  copiedLabel?: string | null;
  copyText?: string;
  copiedText?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-52 shrink-0 font-mono text-xs text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs text-foreground">
        {value}
      </code>
      {onCopy && (
        <button type="button" className="text-xs text-brand hover:underline" onClick={onCopy}>
          {copiedLabel === label ? copiedText : copyText}
        </button>
      )}
      {extra}
      {note && <p className="w-full pl-52 text-xs text-muted">{note}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { resendWebhookDeliveryAction } from "../../webhookActions";

export type DeliveryRow = {
  id: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  lastStatus: number | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  requestId: string | null;
};

const BADGE: Record<DeliveryRow["status"], string> = {
  delivered: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  failed: "bg-danger/15 text-danger",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";

export function DeliveriesPanel({
  apiKeyId,
  rows,
}: {
  apiKeyId: string;
  rows: DeliveryRow[];
}) {
  const t = useTranslations("webhooks");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onResend(id: string) {
    setBusy(id);
    setError(null);
    const res = await resendWebhookDeliveryAction(id, apiKeyId);
    if (!res.ok) setError(res.error);
    setBusy(null);
  }

  return (
    <Card className="mt-4 p-4">
      <p className="mb-1 text-sm font-medium text-foreground">{t("deliveries")}</p>
      <p className="mb-3 text-xs text-muted">{t("deliveriesHint")}</p>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t("deliveriesEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted">
                <th className="py-2 pr-3 font-medium">{t("colEvent")}</th>
                <th className="py-2 pr-3 font-medium">{t("colStatus")}</th>
                <th className="py-2 pr-3 font-medium">{t("colAttempts")}</th>
                <th className="py-2 pr-3 font-medium">{t("colWhen")}</th>
                <th className="py-2 pr-3 font-medium">{t("colDetail")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 font-medium text-foreground">{r.event}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status]}`}
                    >
                      {t(`status_${r.status}`)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-muted">{r.attempts}</td>
                  <td className="py-2 pr-3 text-xs text-muted">
                    {r.status === "delivered"
                      ? fmt(r.deliveredAt)
                      : r.status === "pending"
                        ? `${t("nextTry")} ${fmt(r.nextAttemptAt)}`
                        : fmt(r.createdAt)}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">
                    {r.lastError ? (
                      <span title={r.lastError} className="line-clamp-2">
                        {r.lastStatus ? `HTTP ${r.lastStatus} · ` : ""}
                        {r.lastError}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {r.status !== "delivered" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === r.id}
                        onClick={() => onResend(r.id)}
                      >
                        {busy === r.id ? "…" : t("resend")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

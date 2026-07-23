"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { selectKybCandidateAction, dismissKybCandidatesAction } from "@/app/admin/actions";
import { RunKybRegistryButton } from "@/components/admin/RunKybRegistryButton";

export type KybCandidate = {
  kyb_response_id: string;
  name?: string;
  registration_number?: string;
  status?: string;
  type?: string;
  fetch_status?: string;
  match_reason?: string;
};

/**
 * Selección de empresa cuando la búsqueda registral fue ambigua. El select de
 * DIDIT es FACTURABLE e irreversible: radio + confirmación en dos pasos con
 * aviso explícito. "Ninguna coincide" cierra el ciclo sin facturar; "Repetir
 * búsqueda" abre un ciclo nuevo (gratis).
 */
export function KybCandidatePicker({
  checkId,
  requestId,
  candidates,
}: {
  checkId: string;
  requestId: string;
  candidates: KybCandidate[];
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await selectKybCandidateAction(checkId, choice);
      if (!res.ok) {
        setError(res.error || t("kybSelectError"));
        setBusy(false);
        setConfirming(false);
        // El estado real (reserva, incierto, resuelto por otro) viene del server.
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError(t("kybSelectError"));
      setBusy(false);
      setConfirming(false);
    }
  }

  async function onDismiss() {
    setBusy(true);
    setError(null);
    try {
      const res = await dismissKybCandidatesAction(checkId);
      if (!res.ok) {
        setError(res.error || t("kybSelectError"));
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError(t("kybSelectError"));
      setBusy(false);
    }
  }

  const reasonLabel = (r?: string) => {
    if (r === "exact_registration_number") return t("kybMatchReason_exact_registration_number");
    if (r === "name_result") return t("kybMatchReason_name_result");
    return r ?? "";
  };

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-foreground">{t("kybCandidates")}</p>
      <p className="mb-1.5 text-xs text-muted">{t("kybCandidatesHint")}</p>
      <div className="space-y-1.5">
        {candidates.map((c) => (
          <label
            key={c.kyb_response_id}
            className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border p-2 text-xs ${
              choice === c.kyb_response_id
                ? "border-brand bg-brand/5"
                : "border-border hover:bg-surface-2"
            }`}
          >
            <input
              type="radio"
              name={`kyb-candidate-${checkId}`}
              className="accent-brand"
              checked={choice === c.kyb_response_id}
              disabled={busy}
              onChange={() => {
                setChoice(c.kyb_response_id);
                setConfirming(false);
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">{c.name || "—"}</div>
              <div className="text-muted">
                {[c.registration_number, c.type, c.status, c.fetch_status]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {c.match_reason && (
                <div className="mt-0.5 text-[10px] text-muted">{reasonLabel(c.match_reason)}</div>
              )}
            </div>
          </label>
        ))}
      </div>

      {confirming ? (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-xs text-amber-700 dark:text-amber-400">{t("kybConfirmSelect")}</p>
          <div className="mt-1.5 flex gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={onConfirm}>
              {busy ? "…" : t("kybConfirm")}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy || !choice} onClick={() => setConfirming(true)}>
            {t("kybSelectBillable")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
            {t("kybNoneMatch")}
          </Button>
          <RunKybRegistryButton
            requestId={requestId}
            disabled={busy}
            label={t("kybRepeatSearch")}
          />
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

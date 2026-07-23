"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { runKybRegistryAction } from "@/app/admin/actions";

/** Datos declarados que el ciclo enviará a DIDIT (los calcula la página con
 * extractKybDeclared — la misma función del run real, el tooltip no miente). */
export type KybDeclaredPreview = {
  name: string;
  registrationNumber: string | null;
  country: string | null;
};

/**
 * Dispara un ciclo de validación registral (kyb_registry). La búsqueda es
 * gratis pero tarda ~90s: el botón queda en busy mientras corre y refresca el
 * detalle al terminar. Al hover muestra qué datos se enviarán a DIDIT.
 */
export function RunKybRegistryButton({
  requestId,
  disabled,
  label,
  declared,
}: {
  requestId: string;
  disabled?: boolean;
  /** Texto alternativo (p. ej. "Repetir búsqueda" dentro del picker). */
  label?: string;
  declared?: KybDeclaredPreview | null;
}) {
  const t = useTranslations("admin");
  const tF = useTranslations("admin.checkFields");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRun() {
    setBusy(true);
    setError(null);
    try {
      const res = await runKybRegistryAction(requestId);
      if (!res.ok) {
        setError(res.error || t("kybRunError"));
        setBusy(false);
        return;
      }
      router.refresh();
      setBusy(false);
    } catch {
      setError(t("kybRunError"));
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="group relative inline-flex">
        <Button variant="outline" size="sm" disabled={disabled || busy} onClick={onRun}>
          {busy ? t("kybRunBusy") : (label ?? t("kybRun"))}
        </Button>
        {/* Tooltip: qué se enviará a DIDIT (visible también con el botón deshabilitado) */}
        {declared && (
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden w-64 rounded-lg border border-border bg-surface-card p-2 text-left text-[11px] whitespace-normal text-foreground shadow-lg group-hover:block"
          >
            <span className="mb-1 block font-semibold">{t("kybWillSend")}</span>
            <span className="block">
              <span className="text-muted">{tF("companyName")}:</span> {declared.name || "—"}
            </span>
            {declared.registrationNumber && (
              <span className="block">
                <span className="text-muted">{tF("regNumber")}:</span> {declared.registrationNumber}
              </span>
            )}
            {declared.country ? (
              <span className="block">
                <span className="text-muted">{tF("registryCountry")}:</span> {declared.country}
              </span>
            ) : (
              <span className="block text-danger">{t("kybMissingCountry")}</span>
            )}
            <span className="mt-1 block font-medium">
              {declared.registrationNumber ? t("kybSearchByNumber") : t("kybSearchByName")}
            </span>
            <span className="mt-1 block text-muted">{t("kybWillSendNote")}</span>
          </span>
        )}
      </span>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

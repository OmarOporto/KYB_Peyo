"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

/**
 * Acciones del informe. La descarga pasa por el Route Handler que renderiza el
 * PDF con Chromium: se pide como blob y se dispara un enlace `download`, para
 * que sea una descarga de verdad y no el diálogo de impresión del navegador.
 * `window.print()` queda como acción secundaria para quien sí quiere papel.
 */
export function ReportActions({ requestId }: { requestId: string }) {
  const t = useTranslations("report");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/report`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // El nombre lo decide el servidor en el Content-Disposition; se lee de ahí
      // para no duplicar la convención en el cliente.
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = match?.[1] ?? `informe-${requestId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      console.error("[report] download failed", e);
      setError(t("downloadError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
          {t("print")}
        </Button>
        <Button type="button" size="sm" onClick={download} disabled={busy}>
          {busy ? t("downloading") : t("download")}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

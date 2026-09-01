"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

/**
 * Descarga del informe en PDF: el diálogo de impresión del navegador con
 * "Guardar como PDF". Los estilos `@media print` de globals.css ocultan el
 * cromo (sidebar, botones) y fuerzan tinta clara aunque el tema sea oscuro.
 */
export function PrintButton() {
  const t = useTranslations("report");
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      {t("download")}
    </Button>
  );
}

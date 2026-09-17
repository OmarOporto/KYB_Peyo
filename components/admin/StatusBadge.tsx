"use client";

import { useTranslations } from "next-intl";

const COLORS: Record<string, string> = {
  created: "bg-surface-2 text-muted",
  in_progress: "bg-brand/10 text-brand",
  submitted: "bg-brand/10 text-brand",
  under_review: "bg-warning/15 text-warning",
  changes_requested: "bg-alert/15 text-alert",
  approved: "bg-success/15 text-success",
  rejected: "bg-danger/15 text-danger",
  expired: "bg-surface-2 text-muted",
  // Un check que no llegó a ejecutarse: el relleno neutro dice «sin resultado»
  // y el rojo del texto y el anillo dicen «algo falló». No es un `rejected`.
  failed: "bg-surface-2 text-danger ring-1 ring-inset ring-danger/30",
};

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("status");
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        COLORS[status] ?? "bg-surface-2 text-muted"
      }`}
    >
      {t.has(status) ? t(status) : status}
    </span>
  );
}

"use client";

import { useTranslations } from "next-intl";

const COLORS: Record<string, string> = {
  created: "bg-surface-2 text-muted",
  in_progress: "bg-brand/10 text-brand",
  submitted: "bg-brand/10 text-brand",
  under_review: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  changes_requested: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  approved: "bg-success/15 text-success",
  rejected: "bg-danger/15 text-danger",
  expired: "bg-surface-2 text-muted",
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

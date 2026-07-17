"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";
import type { KybStatus } from "@/lib/kyb/types";

const STATUSES: KybStatus[] = [
  "created",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "expired",
];

export type RequestsFilters = {
  q: string;
  status: string;
  from: string;
  to: string;
};

/**
 * Barra de filtros del listado de solicitudes. Recibe los valores actuales
 * como props (leídos del `searchParams` en el server) y navega actualizando
 * la query string. Al cambiar cualquier filtro se resetea la página a 1.
 */
export function RequestsToolbar({ current }: { current: RequestsFilters }) {
  const t = useTranslations("admin");
  const tStatus = useTranslations("status");
  const router = useRouter();

  const [q, setQ] = useState(current.q);

  function pushWith(next: Partial<RequestsFilters>) {
    const merged = { ...current, q, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.status) params.set("status", merged.status);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    // Al cambiar un filtro volvemos a la primera página (no re-agregamos `page`).
    const qs = params.toString();
    router.push(qs ? `/admin?${qs}` : "/admin");
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    pushWith({});
  }

  const hasFilters = Boolean(
    current.q || current.status || current.from || current.to,
  );

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <form onSubmit={onSearchSubmit} className="flex items-end gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className={`${inputCls} w-56`}
        />
        <Button type="submit" variant="outline" size="sm">
          {t("search")}
        </Button>
      </form>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">{t("status")}</span>
        <select
          value={current.status}
          onChange={(e) => pushWith({ status: e.target.value })}
          aria-label={t("status")}
          className={`${inputCls} w-44`}
        >
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">{t("dateFrom")}</span>
        <input
          type="date"
          value={current.from}
          max={current.to || undefined}
          onChange={(e) => pushWith({ from: e.target.value })}
          aria-label={t("dateFrom")}
          className={`${inputCls} w-40`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">{t("dateTo")}</span>
        <input
          type="date"
          value={current.to}
          min={current.from || undefined}
          onChange={(e) => pushWith({ to: e.target.value })}
          aria-label={t("dateTo")}
          className={`${inputCls} w-40`}
        />
      </label>

      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            router.push("/admin");
          }}
        >
          {t("clearFilters")}
        </Button>
      )}
    </div>
  );
}

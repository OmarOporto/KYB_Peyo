import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/Card";
import { ClickableRow } from "@/components/admin/ClickableRow";
import { OriginBadge } from "@/components/admin/OriginBadge";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { KybStatus } from "@/lib/kyb/types";
import { RequestsToolbar } from "./RequestsToolbar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const STATUSES: KybStatus[] = [
  "created",
  "in_progress",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "expired",
];

function isStatus(v: string | undefined): v is KybStatus {
  return !!v && (STATUSES as string[]).includes(v);
}

const PUBLIC_PREFIX = "public:";

/**
 * Los intakes web llevan el prefijo `public:` (ver `startPublicIntake`), que el
 * badge de origen ya comunica. Las refs de la API son texto libre del cliente y
 * se muestran enteras: pueden contener ":" y recortarlas escondería parte.
 */
function displayRef(ref: string, api: boolean): string {
  if (api || !ref.startsWith(PUBLIC_PREFIX)) return ref;
  return ref.slice(PUBLIC_PREFIX.length);
}

/**
 * Etiqueta de los clientes dueños de las solicitudes de esta página. `api_keys`
 * no tiene políticas RLS (solo service-role), así que no se puede leer con el
 * cliente de sesión ni con un join embebido — igual que en /admin/clients.
 */
async function clientLabels(keyIds: string[]): Promise<Map<string, string>> {
  if (keyIds.length === 0) return new Map();
  const { data } = await createServiceClient()
    .from("api_keys")
    .select("id, label")
    .in("id", keyIds);
  return new Map((data ?? []).map((k) => [k.id as string, k.label as string]));
}

/** Query string preservando filtros, para los enlaces de paginación. */
function buildQuery(
  base: { q: string; status: string; from: string; to: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  if (base.status) params.set("status", base.status);
  if (base.from) params.set("from", base.from);
  if (base.to) params.set("to", base.to);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const t = await getTranslations("admin");
  const locale = await getLocale();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const status = isStatus(sp.status) ? sp.status : "";
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const filters = { q, status, from, to };
  const hasFilters = Boolean(q || status || from || to);

  const supabase = await createServerSupabase();
  let query = supabase
    .from("kyb_requests")
    .select("id, external_ref, status, created_at, api_key_id", {
      count: "exact",
    });

  if (q) query = query.ilike("external_ref", `%${q}%`);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) {
    // `to` es una fecha (YYYY-MM-DD); incluir el día completo → límite exclusivo al día siguiente.
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    query = query.lt("created_at", next.toISOString());
  }

  const { data: requests, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = requests ?? [];
  const labels = await clientLabels([
    ...new Set(
      rows.map((r) => r.api_key_id).filter((id): id is string => Boolean(id)),
    ),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="mb-4 font-display text-2xl font-bold text-foreground">
        {t("requestsTitle")}
      </h1>

      <RequestsToolbar current={filters} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("company")}</th>
                <th className="px-4 py-2.5 font-medium">{t("status")}</th>
                <th className="px-4 py-2.5 font-medium">{t("created")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const client = r.api_key_id ? labels.get(r.api_key_id) : null;
                const api = Boolean(r.api_key_id);
                return (
                  <ClickableRow key={r.id} href={`/admin/requests/${r.id}`}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <OriginBadge
                          api={api}
                          label={
                            api
                              ? client
                                ? `${t("originApi")} · ${client}`
                                : t("originApi")
                              : t("originWeb")
                          }
                        />
                        {/* La fila entera navega, pero el enlace real es lo que
                            la hace accesible: foco por teclado y abrir en
                            pestaña nueva. */}
                        <Link
                          href={`/admin/requests/${r.id}`}
                          className="rounded font-mono font-medium text-foreground outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                        >
                          {displayRef(r.external_ref, api)}
                        </Link>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {new Date(r.created_at).toLocaleString(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                  </ClickableRow>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted">
                    {hasFilters ? t("noResults") : t("noRequests")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            {t("pageOf", { page, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <PageLink
              href={buildQuery(filters, page - 1)}
              disabled={page <= 1}
              label={t("previous")}
            />
            <PageLink
              href={buildQuery(filters, page + 1)}
              disabled={page >= totalPages}
              label={t("next")}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function PageLink({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  const cls =
    "rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors";
  if (disabled) {
    return (
      <span className={`${cls} cursor-not-allowed text-muted opacity-50`}>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={`${cls} text-foreground hover:bg-surface-2`}>
      {label}
    </Link>
  );
}

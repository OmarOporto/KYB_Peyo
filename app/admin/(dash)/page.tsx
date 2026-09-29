import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";
import { ClickableRow } from "@/components/admin/ClickableRow";
import { OriginBadge } from "@/components/admin/OriginBadge";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { resolveText, type LocalizedText } from "@/lib/forms/definition";
import type { KybStatus } from "@/lib/kyb/types";
import { RequestsToolbar } from "./RequestsToolbar";
import { requireAnalyst } from "@/lib/auth/admin";

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

type RequestRow = {
  id: string;
  external_ref: string;
  status: string;
  created_at: string;
  api_key_id: string | null;
  form_id: string | null;
  form_revision: number | null;
  /** `form_definition->title` del snapshot: sobrevive al borrado del formulario. */
  snapshot_title: LocalizedText | null;
  form: { name: string } | null;
};

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
  // Guard propio y no solo el del layout: Next los renderiza en paralelo, y
  // esta página consulta con service-role (bypassa RLS) para los labels.
  await requireAnalyst();
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
  // El formulario sale del join por `form_id` (nombre vigente). Si se eliminó,
  // `form_id` quedó a null (0020) y el título del snapshot es lo que queda.
  let query = supabase
    .from("kyb_requests")
    .select(
      "id, external_ref, status, created_at, api_key_id, form_id, form_revision, snapshot_title:form_definition->title, form:forms(name)",
      { count: "exact" },
    );

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
  const rows = (requests ?? []) as unknown as RequestRow[];
  const labels = await clientLabels([
    ...new Set(
      rows.map((r) => r.api_key_id).filter((id): id is string => Boolean(id)),
    ),
  ]);

  /**
   * Nombre del formulario (el vigente, por `form_id`) y una línea de contexto.
   * Sin join hay dos casos: se eliminó (queda el título del snapshot) o la
   * solicitud nunca tuvo formulario fijado (API antigua → el publicado por
   * defecto, que puede haber cambiado desde entonces).
   */
  function formCell(r: RequestRow) {
    if (r.form) {
      return {
        name: r.form.name,
        meta:
          r.form_revision != null ? t("revisionShort", { n: r.form_revision }) : null,
        muted: false,
        hint: r.form.name,
      };
    }
    const snapshot = resolveText(r.snapshot_title, locale);
    if (snapshot) {
      return {
        name: snapshot,
        meta: r.form_id ? null : t("formDeleted"),
        muted: false,
        hint: snapshot,
      };
    }
    return { name: t("formDefault"), meta: null, muted: true, hint: t("formDefaultHint") };
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {t("requestsTitle")}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{t("resultsCount", { count: total })}</p>
      </header>

      <RequestsToolbar current={filters} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {/* `table-fixed` + anchos por columna: un texto largo (referencia de
              la API, nombre del cliente o del formulario) se trunca con
              tooltip en vez de empujar las otras columnas. Por debajo del
              `min-w` la tabla scrollea en horizontal en lugar de aplastarse. */}
          <table className="w-full min-w-190 table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[30%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("company")}</th>
                <th className="px-4 py-2.5 font-medium">{t("form")}</th>
                <th className="px-4 py-2.5 font-medium">{t("status")}</th>
                <th className="px-4 py-2.5 font-medium">{t("created")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const client = r.api_key_id ? labels.get(r.api_key_id) : null;
                const api = Boolean(r.api_key_id);
                const ref = displayRef(r.external_ref, api);
                const form = formCell(r);
                const created = new Date(r.created_at);
                return (
                  <ClickableRow key={r.id} href={`/admin/requests/${r.id}`}>
                    <td className="px-4 py-3">
                      {/* La fila entera navega, pero el enlace real es lo que
                          la hace accesible: foco por teclado y abrir en
                          pestaña nueva. */}
                      <Link
                        href={`/admin/requests/${r.id}`}
                        title={ref}
                        className="block truncate rounded font-mono font-medium text-foreground outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                      >
                        {ref}
                      </Link>
                      <span className="mt-1 flex min-w-0 items-center gap-1.5">
                        <OriginBadge
                          api={api}
                          label={api ? t("originApi") : t("originWeb")}
                        />
                        {client && (
                          <span className="truncate text-xs text-muted" title={client}>
                            {client}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`block truncate ${form.muted ? "text-muted" : "text-foreground"}`}
                        title={form.hint}
                      >
                        {form.name}
                      </span>
                      {form.meta && (
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {form.meta}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="block text-foreground">
                        {created.toLocaleDateString(locale, { dateStyle: "medium" })}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {created.toLocaleTimeString(locale, { timeStyle: "short" })}
                      </span>
                    </td>
                  </ClickableRow>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
                        <Inbox size={20} aria-hidden />
                      </span>
                      <p className="text-sm text-muted">
                        {hasFilters ? t("noResults") : t("noRequests")}
                      </p>
                      {hasFilters && (
                        <Link
                          href="/admin"
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          {t("clearFilters")}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            {t("pageOf", { page, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <PageLink
              href={buildQuery(filters, page - 1)}
              disabled={page <= 1}
              label={t("previous")}
              dir="prev"
            />
            <PageLink
              href={buildQuery(filters, page + 1)}
              disabled={page >= totalPages}
              label={t("next")}
              dir="next"
            />
          </div>
        </nav>
      )}
    </main>
  );
}

function PageLink({
  href,
  disabled,
  label,
  dir,
}: {
  href: string;
  disabled: boolean;
  label: string;
  dir: "prev" | "next";
}) {
  const content =
    dir === "prev" ? (
      <>
        <ChevronLeft size={16} aria-hidden />
        {label}
      </>
    ) : (
      <>
        {label}
        <ChevronRight size={16} aria-hidden />
      </>
    );
  if (disabled) {
    return (
      <span
        aria-disabled
        className={buttonClass({
          variant: "outline",
          size: "sm",
          className: "pointer-events-none opacity-50",
        })}
      >
        {content}
      </span>
    );
  }
  return (
    <Link href={href} className={buttonClass({ variant: "outline", size: "sm" })}>
      {content}
    </Link>
  );
}

import { getTranslations } from "next-intl/server";
import { requireAnalyst } from "@/lib/auth/admin";
import { resolveListScope } from "@/lib/auth/tenant";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { ClientsPanel, type ClientRow } from "./ClientsPanel";

export const dynamic = "force-dynamic";

/** Etiqueta visible de la versión desplegada. Editar a mano en cada entrega. */
const BUILD_LABEL = "2nd version";

/**
 * Marcador de build: confirma de un vistazo QUÉ versión está sirviendo, algo
 * que se volvió necesario tras el cambio de cuenta de Vercel. El commit lo
 * inyecta Vercel solo (el proyecto tiene `autoExposeSystemEnvs`), así que el
 * badge no depende de acordarse de actualizar nada.
 */
function BuildBadge() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  return (
    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
      {BUILD_LABEL}
      {sha ? ` · ${sha}` : " · local"}
    </span>
  );
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const analyst = await requireAnalyst();
  const t = await getTranslations("clients");
  const { scope } = await resolveListScope(analyst, (await searchParams).org);

  // api_keys y su uso viven en tablas solo-service-role (sin políticas RLS),
  // así que se leen con el cliente service-role y el filtro de org va acá, a
  // mano: sin él, cada cliente veía las keys de todos. NUNCA se selecciona
  // key_hash.
  const supabase = createServiceClient();
  let keysQuery = supabase
    .from("api_keys")
    .select(
      "id, label, created_at, revoked_at, last_used_at, rate_limit_per_min, allow_ai_translation",
    )
    .order("created_at", { ascending: false });
  if (scope) keysQuery = keysQuery.eq("org_id", scope);
  const { data: keys } = await keysQuery;

  // Uso solo de las keys visibles (antes se leía la tabla entera).
  const keyIds = (keys ?? []).map((k) => k.id as string);
  const { data: usage } = keyIds.length
    ? await supabase.from("api_key_usage").select("api_key_id, day, count").in("api_key_id", keyIds)
    : { data: [] };

  const today = new Date().toISOString().slice(0, 10);
  const totals = new Map<string, number>();
  const todayCounts = new Map<string, number>();
  for (const u of usage ?? []) {
    const id = u.api_key_id as string;
    totals.set(id, (totals.get(id) ?? 0) + (u.count as number));
    if (u.day === today) todayCounts.set(id, (todayCounts.get(id) ?? 0) + (u.count as number));
  }

  const rows: ClientRow[] = (keys ?? []).map((k) => ({
    id: k.id as string,
    label: k.label as string,
    createdAt: k.created_at as string,
    lastUsedAt: (k.last_used_at as string | null) ?? null,
    today: todayCounts.get(k.id as string) ?? 0,
    total: totals.get(k.id as string) ?? 0,
    rateLimit: (k.rate_limit_per_min as number | null) ?? null,
    revoked: Boolean(k.revoked_at),
    aiTranslation: k.allow_ai_translation === true,
  }));

  return (
    <main className="w-full p-6 xl:px-8">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="font-display text-2xl font-bold text-foreground">{t("title")}</h1>
        <BuildBadge />
      </div>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>
      <ClientsPanel rows={rows} defaultLimit={env.apiRateLimitDefault()} />
    </main>
  );
}

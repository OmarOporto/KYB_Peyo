import { getTranslations } from "next-intl/server";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { ClientsPanel, type ClientRow } from "./ClientsPanel";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireAnalyst();
  const t = await getTranslations("clients");

  // api_keys y su uso viven en tablas solo-service-role (sin políticas RLS),
  // así que se leen con el cliente service-role. NUNCA se selecciona key_hash.
  const supabase = createServiceClient();
  const [{ data: keys }, { data: usage }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, label, created_at, revoked_at, last_used_at, rate_limit_per_min")
      .order("created_at", { ascending: false }),
    supabase.from("api_key_usage").select("api_key_id, day, count"),
  ]);

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
  }));

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-foreground">{t("title")}</h1>
      <p className="mb-4 text-sm text-muted">{t("subtitle")}</p>
      <ClientsPanel rows={rows} defaultLimit={env.apiRateLimitDefault()} />
    </main>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { WebhooksPanel, type WebhookRow } from "./WebhooksPanel";
import { IntegrationConfig, type IntegrationForm } from "./IntegrationConfig";
import { DeliveriesPanel, type DeliveryRow } from "./DeliveriesPanel";

export const dynamic = "force-dynamic";

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ keyId: string }>;
}) {
  await requireAnalyst();
  const { keyId } = await params;
  const t = await getTranslations("webhooks");

  const supabase = createServiceClient();
  const [{ data: key }, { data: eps }, { data: forms }] = await Promise.all([
    supabase
      .from("api_keys")
      .select("id, label, key_prefix, default_form_id")
      .eq("id", keyId)
      .maybeSingle(),
    supabase
      .from("webhook_endpoints")
      .select("id, url, secret_last4, enabled, created_at")
      .eq("api_key_id", keyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("forms")
      .select("id, name")
      .eq("status", "published")
      .order("updated_at", { ascending: false }),
  ]);

  // Entregas de los endpoints de este cliente. Se consulta después porque
  // depende de los ids obtenidos arriba.
  const endpointIds = (eps ?? []).map((e) => e.id as string);
  const { data: dels } = endpointIds.length
    ? await supabase
        .from("webhook_deliveries")
        .select(
          "id, event, status, attempts, last_error, last_status, next_attempt_at, delivered_at, created_at, request_id",
        )
        .in("endpoint_id", endpointIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  const deliveries: DeliveryRow[] = (dels ?? []).map((d) => ({
    id: d.id as string,
    event: d.event as string,
    status: d.status as DeliveryRow["status"],
    attempts: (d.attempts as number) ?? 0,
    lastError: (d.last_error as string | null) ?? null,
    lastStatus: (d.last_status as number | null) ?? null,
    nextAttemptAt: (d.next_attempt_at as string | null) ?? null,
    deliveredAt: (d.delivered_at as string | null) ?? null,
    createdAt: d.created_at as string,
    requestId: (d.request_id as string | null) ?? null,
  }));

  const rows: WebhookRow[] = (eps ?? []).map((e) => ({
    id: e.id as string,
    url: e.url as string,
    secretLast4: (e.secret_last4 as string | null) ?? null,
    enabled: Boolean(e.enabled),
    createdAt: e.created_at as string,
  }));
  const publishedForms: IntegrationForm[] = (forms ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
  }));
  const enabledEndpointIds = rows.filter((r) => r.enabled).map((r) => r.id);

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href="/admin/clients" className="text-sm text-brand hover:underline">
        ← {t("back")}
      </Link>
      <h1 className="mt-3 mb-1 font-display text-2xl font-bold text-foreground">
        {t("title")}
      </h1>
      <p className="mb-4 text-sm text-muted">{(key?.label as string) ?? keyId}</p>

      <IntegrationConfig
        apiKeyId={keyId}
        baseUrl={env.appUrl()}
        keyPrefix={(key?.key_prefix as string | null) ?? null}
        forms={publishedForms}
        defaultFormId={(key?.default_form_id as string | null) ?? null}
        endpointIds={enabledEndpointIds}
      />

      <WebhooksPanel apiKeyId={keyId} rows={rows} />

      <DeliveriesPanel apiKeyId={keyId} rows={deliveries} />
    </main>
  );
}

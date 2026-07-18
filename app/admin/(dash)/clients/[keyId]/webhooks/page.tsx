import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { WebhooksPanel, type WebhookRow } from "./WebhooksPanel";
import { IntegrationConfig, type IntegrationForm } from "./IntegrationConfig";

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
    </main>
  );
}

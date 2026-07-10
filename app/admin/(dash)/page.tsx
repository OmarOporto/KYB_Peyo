import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/admin/StatusBadge";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const t = await getTranslations("admin");
  const supabase = await createServerSupabase();
  const { data: requests } = await supabase
    .from("kyb_requests")
    .select("id, external_ref, status, created_at, submitted_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <h1 className="mb-4 font-display text-2xl font-bold text-foreground">
        {t("requestsTitle")}
      </h1>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("company")}</th>
                <th className="px-4 py-2.5 font-medium">{t("status")}</th>
                <th className="px-4 py-2.5 font-medium">{t("created")}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {(requests ?? []).map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border transition-colors hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {r.external_ref}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/requests/${r.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {t("review")} →
                    </Link>
                  </td>
                </tr>
              ))}
              {(!requests || requests.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    {t("noRequests")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

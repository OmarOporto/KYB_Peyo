import Link from "next/link";
import { requireAnalyst } from "@/lib/auth/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { signOutAction } from "./actions";
import { StatusBadge } from "./StatusBadge";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const analyst = await requireAnalyst();
  const supabase = await createServerSupabase();
  const { data: requests } = await supabase
    .from("kyb_requests")
    .select("id, external_ref, status, created_at, submitted_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes KYB</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{analyst.email}</span>
          <form action={signOutAction}>
            <button className="rounded border border-gray-300 px-3 py-1">
              Salir
            </button>
          </form>
        </div>
      </header>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-2">Empresa (ref)</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Creada</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{r.external_ref}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/admin/requests/${r.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Revisar →
                  </Link>
                </td>
              </tr>
            ))}
            {(!requests || requests.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  No hay solicitudes todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

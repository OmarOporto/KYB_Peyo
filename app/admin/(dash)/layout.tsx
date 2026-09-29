import { cookies } from "next/headers";
import { requireAnalyst } from "@/lib/auth/admin";
import { Sidebar } from "@/components/admin/Sidebar";
import { SIDEBAR_COOKIE } from "@/components/admin/sidebarState";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const analyst = await requireAnalyst();
  // Leído en el server para que el primer render ya salga plegado o no: con
  // localStorage el sidebar parpadearía abierto en cada carga.
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    // `data-print-shell`: en impresión este flex se aplana a bloque, si no
    // Chrome ignora los break-inside del informe (ver globals.css).
    <div data-print-shell className="flex min-h-screen flex-col md:flex-row">
      <Sidebar email={analyst.email} initialCollapsed={collapsed} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

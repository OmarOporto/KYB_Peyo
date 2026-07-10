import { requireAnalyst } from "@/lib/auth/admin";
import { Sidebar } from "@/components/admin/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const analyst = await requireAnalyst();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar email={analyst.email} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

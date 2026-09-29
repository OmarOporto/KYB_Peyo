import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";

/**
 * 404 dentro del panel (con el menú). Lo muestran los `notFound()` de las
 * páginas de `(dash)`: un recurso que no existe, uno de otra organización o una
 * sección solo de admin. A propósito no distingue entre esos casos: decir "no
 * tenés acceso" confirmaría que el recurso existe.
 */
export default async function DashNotFound() {
  const t = await getTranslations("admin");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-center p-6">
      <Card className="w-full p-8 text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <SearchX size={22} aria-hidden />
        </span>
        <h1 className="font-display text-xl font-bold text-foreground">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("notFoundBody")}</p>
        <Link href="/admin" className={buttonClass({ className: "mt-6" })}>
          {t("notFoundBack")}
        </Link>
      </Card>
    </main>
  );
}

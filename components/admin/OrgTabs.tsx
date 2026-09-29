import { getTranslations } from "next-intl/server";
import type { OrgOption } from "@/lib/auth/tenant";
import { TabLink } from "./TabLink";

/**
 * Pestañas por organización, solo para el admin de plataforma: "Todas" y una
 * por org. Un miembro no las ve (su vista es siempre su org). Con muchas orgs
 * la fila scrollea en horizontal en vez de envolver.
 *
 * `hrefFor(null)` es la pestaña "Todas".
 */
export async function OrgTabs({
  orgs,
  active,
  hrefFor,
}: {
  orgs: OrgOption[];
  active: string | null;
  hrefFor: (orgId: string | null) => string;
}) {
  if (orgs.length === 0) return null;
  const t = await getTranslations("orgs");
  return (
    <nav
      aria-label={t("tabs")}
      className="mb-4 flex gap-1 overflow-x-auto border-b border-border"
    >
      <TabLink href={hrefFor(null)} label={t("all")} isActive={active === null} />
      {orgs.map((o) => (
        <TabLink
          key={o.id}
          href={hrefFor(o.id)}
          label={o.disabled ? `${o.name} (${t("disabled")})` : o.name}
          isActive={active === o.id}
        />
      ))}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Brand } from "@/components/Brand";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signOutAction } from "@/app/admin/actions";

export function Sidebar({ email }: { email: string }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();

  const items = [
    { href: "/admin", label: t("requests"), icon: <ListIcon />, exact: true },
    { href: "/admin/forms", label: t("forms"), icon: <TemplateIcon />, exact: false },
    { href: "/admin/didit", label: t("didit"), icon: <FormIcon />, exact: false },
  ];

  return (
    <aside className="flex flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:self-start md:overflow-y-auto md:border-r md:border-b-0">
      <div className="flex items-center border-b border-border px-4 py-4">
        <Link href="/admin" aria-label="Peyo">
          <Brand size="lg" />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((it) => {
          const active = it.exact
            ? pathname === it.href
            : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand/10 text-brand"
                  : "text-foreground hover:bg-surface-2"
              }`}
            >
              {it.icon}
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-border p-3">
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <p className="truncate px-1 text-xs text-muted" title={email}>
          {email}
        </p>
        <form action={signOutAction}>
          <button className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-2">
            {tc("logout")}
          </button>
        </form>
      </div>
    </aside>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function TemplateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function FormIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}

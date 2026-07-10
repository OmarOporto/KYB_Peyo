import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "./Brand";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

/** Barra superior con el logo Peyo, controles de idioma/tema y un slot opcional. */
export function AppHeader({
  right,
  href = "/",
}: {
  right?: ReactNode;
  href?: string;
}) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3">
        <Link href={href} aria-label="Peyo">
          <Brand size="md" />
        </Link>
        <div className="flex items-center gap-2">
          {right}
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

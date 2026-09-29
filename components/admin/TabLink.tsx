import Link from "next/link";

/**
 * Pestaña como enlace (la pestaña activa vive en la URL, así se puede
 * compartir y el "atrás" del navegador funciona). Va dentro de una fila con
 * `border-b`: el `-mb-px` monta el subrayado activo sobre ese borde.
 */
export function TabLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        isActive
          ? "border-brand text-brand"
          : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

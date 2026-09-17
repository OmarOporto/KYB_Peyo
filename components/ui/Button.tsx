import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "success" | "danger" | "ghost" | "quiet";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover focus-visible:ring-brand/40",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-2 focus-visible:ring-brand/30",
  success: "bg-success text-white hover:brightness-95 focus-visible:ring-success/40",
  danger: "bg-danger text-white hover:brightness-95 focus-visible:ring-danger/40",
  ghost: "text-foreground hover:bg-surface-2 focus-visible:ring-brand/30",
  // Acción de bajo peso: gris en reposo, tinta plena al pasar el cursor.
  quiet: "text-muted hover:bg-surface-2 hover:text-foreground focus-visible:ring-brand/30",
};

// El `gap` va aquí y no en BASE para que `icon` no lo reciba. En un botón con un
// solo hijo es inerte, así que ningún botón existente cambia de aspecto.
const SIZES: Record<Size, string> = {
  sm: "gap-1.5 px-3 py-1.5 text-sm",
  md: "gap-2 px-5 py-2.5 text-sm",
  // Botón cuadrado para un solo icono: el `aria-label` es obligatorio.
  icon: "h-8 w-8 p-0",
};

const BASE =
  "inline-flex cursor-pointer items-center justify-center rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none";

/**
 * Las clases de un botón SIN el `<button>`: para un `<Link>` (o cualquier
 * elemento) que deba verse exactamente igual. `Button` es esto mismo aplicado a
 * un `<button>`.
 *
 * Ojo al componer con `className`: el repo no tiene tailwind-merge, así que
 * pasar una utilidad que colisione con la de la variante (p. ej. `text-muted`
 * sobre `ghost`, que ya trae `text-foreground`) da un resultado que depende del
 * orden del CSS generado. Para ese caso está la variante `quiet`.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return <button className={buttonClass({ variant, size, className })} {...props} />;
}

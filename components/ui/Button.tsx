import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "success" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover focus-visible:ring-brand/40",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-2 focus-visible:ring-brand/30",
  success: "bg-success text-white hover:brightness-95 focus-visible:ring-success/40",
  danger: "bg-danger text-white hover:brightness-95 focus-visible:ring-danger/40",
  ghost: "text-foreground hover:bg-surface-2 focus-visible:ring-brand/30",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}

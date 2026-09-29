import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

/**
 * Piezas visuales compartidas por las pantallas de acceso. Más grandes que las
 * del panel (`inputCls`): son formularios cortos que se usan de a uno.
 */

export const authInputCls =
  "h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15";

export const authButtonCls =
  "inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-5 text-base font-semibold text-white shadow-sm shadow-brand/30 transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60";

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-base text-muted">{subtitle}</p>}
    </div>
  );
}

export function AuthLabel({
  htmlFor,
  children,
  aside,
}: {
  htmlFor: string;
  children: ReactNode;
  /** Algo a la derecha del label (p. ej. "¿Olvidaste tu contraseña?"). */
  aside?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {children}
      </label>
      {aside}
    </div>
  );
}

const TONES = {
  danger: {
    cls: "border-danger/30 bg-danger/10 text-foreground",
    icon: <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />,
  },
  success: {
    cls: "border-success/30 bg-success/10 text-foreground",
    icon: <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />,
  },
  info: {
    cls: "border-brand/25 bg-brand/5 text-foreground",
    icon: <Info size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />,
  },
} as const;

export function AuthAlert({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`mb-5 flex gap-3 rounded-xl border p-3.5 text-sm leading-relaxed ${t.cls}`}
    >
      {t.icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

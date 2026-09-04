"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Fila de tabla que navega entera a `href`. El contenido debe seguir llevando un
 * <Link> real (foco, teclado, abrir en pestaña nueva) y este handler solo añade
 * la comodidad de clicar en cualquier parte de la fila, ignorando los clics que
 * caen sobre otro control (p. ej. Duplicar).
 */
export function ClickableRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,label")) return;
        router.push(href);
      }}
      className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2"
    >
      {children}
    </tr>
  );
}

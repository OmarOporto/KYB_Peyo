"use client";

import { useEffect } from "react";
import { Button } from "./Button";

/**
 * Confirmación modal para acciones destructivas o que navegan.
 *
 * Unifica los dos modales que vivían sueltos en el builder y en la lista de
 * formularios. De ahí vienen sus dos requisitos menos obvios:
 *
 * - `stopPropagation` en el contenedor: en la lista el modal se renderiza DENTRO
 *   de una fila que es clickeable entera, y sin esto un clic en "Cancelar"
 *   navega al editor.
 * - `title` opcional: el builder confirma con una sola frase; la lista necesita
 *   encabezado + cuerpo para decir qué se va a tocar.
 */
export function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  /** Sin cancelar: el diálogo solo informa (p. ej. "no se puede eliminar porque…"). */
  hideCancel = false,
  onConfirm,
  onCancel,
}: {
  title?: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 text-left"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? body}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface-card p-5 shadow-xl"
      >
        {title && (
          <p className="font-display text-base font-semibold text-foreground">{title}</p>
        )}
        <p className={`text-sm ${title ? "mt-2 text-muted" : "text-foreground"}`}>{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          {!hideCancel && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            autoFocus
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Imagen de ayuda en grande, sobre el mismo fondo del formulario (apenas
 * translúcido): la persona ve que sigue en el formulario y no que se fue a otra
 * pantalla. Se cierra con la X, tocando fuera de la imagen o con Escape.
 *
 * Va en un portal a `document.body`: las imágenes de las opciones viven dentro
 * de un `<label>`, y sin el portal cualquier clic en el visor marcaría la
 * opción.
 */
export function ImageLightbox({
  src,
  caption,
  closeLabel,
  onClose,
}: {
  src: string;
  /** Texto de la pregunta u opción, debajo de la imagen. */
  caption?: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // El foco arranca en la X. Devolverlo a la miniatura al cerrar es cosa de
    // quien abre (HelpImage): acá `document.activeElement` no es confiable,
    // porque Safari no enfoca un botón al tocarlo.
    closeRef.current?.focus();
    // El formulario de fondo no scrollea mientras el visor está abierto.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // El único control es la X: el foco no sale del visor.
      if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption || closeLabel}
      onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-background/95 p-4 pt-20 backdrop-blur-sm sm:p-10 sm:pt-20"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground shadow-md transition-colors outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <X size={18} aria-hidden />
        {closeLabel}
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL pública de form-assets */}
      <img
        src={src}
        alt={caption ?? ""}
        // Tocar la imagen no cierra: solo lo de afuera.
        onClick={(e) => e.stopPropagation()}
        className="max-h-[78vh] max-w-full cursor-default rounded-xl border border-border bg-surface object-contain shadow-lg"
      />
      {caption && <p className="max-w-2xl text-center text-sm text-muted">{caption}</p>}
    </div>,
    document.body,
  );
}

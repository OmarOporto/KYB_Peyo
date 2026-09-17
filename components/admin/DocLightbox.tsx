"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  FileTypeIcon,
  ICON_LINK,
  fileKindOf,
  withDownloadName,
  type DocRow,
} from "./docParts";

/** Documento aplanado con el contexto de su grupo, para la cabecera del visor. */
export type FlatDoc = DocRow & { question: string | null };

/**
 * Visor modal de un documento: imágenes en `<img>`, PDFs en `<iframe>` (Storage
 * los sirve inline mientras la URL NO lleve `&download=`), y lo demás cae a una
 * ficha con descarga.
 *
 * Sigue el contrato de `components/ui/ConfirmModal.tsx` (fixed inset-0 z-50,
 * backdrop, role="dialog", Escape cierra) y le suma trampa de foco y bloqueo de
 * scroll, que aquí sí hacen falta porque el diálogo ocupa la pantalla.
 */
export function DocLightbox({
  docs,
  index,
  url,
  loading,
  onIndex,
  onClose,
  onImageError,
}: {
  docs: FlatDoc[];
  index: number;
  /** URL vigente: la del servidor o una re-firmada por el panel. */
  url?: string;
  loading: boolean;
  onIndex: (next: number) => void;
  onClose: () => void;
  onImageError: () => void;
}) {
  const t = useTranslations("admin");
  const dialogRef = useRef<HTMLDivElement>(null);
  /** Para devolver el foco a donde estaba cuando el visor se cierre. */
  const openerRef = useRef<Element | null>(null);
  const doc = docs[index];
  const kind = doc ? fileKindOf(doc.filename, doc.mime) : "other";

  const go = useCallback(
    (delta: number) => {
      if (docs.length === 0) return;
      onIndex((index + delta + docs.length) % docs.length);
    },
    [index, docs.length, onIndex],
  );

  // Escape cierra, flechas navegan, Tab cicla dentro del diálogo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowRight") return go(1);
      if (e.key === "ArrowLeft") return go(-1);
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const f = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // El fondo no debe hacer scroll mientras el visor está abierto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, []);

  if (!doc) return null;
  const dl = url ? withDownloadName(url, doc.filename) : undefined;
  const meta = [doc.sizeLabel, doc.uploadedAtLabel].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex flex-col p-3 sm:p-6">
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={doc.filename}
        tabIndex={-1}
        className="relative z-10 mx-auto flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-card shadow-xl outline-none"
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <FileTypeIcon kind={kind} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
            <p className="truncate text-xs text-muted">
              {doc.question ?? t("documentsOther")}
              {meta && ` · ${meta}`}
            </p>
          </div>
          {docs.length > 1 && (
            <span className="shrink-0 px-1 text-xs tabular-nums text-muted">
              {t("docPosition", { index: index + 1, total: docs.length })}
            </span>
          )}
          {dl && (
            <a
              href={dl}
              rel="noopener"
              className={`shrink-0 ${ICON_LINK}`}
              aria-label={t("docDownload")}
              title={t("docDownload")}
            >
              <Download size={18} aria-hidden />
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={t("docClose")}
            title={t("docClose")}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-surface-2 p-3">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted">…</p>
          ) : !url ? (
            <p className="py-16 text-center text-sm text-muted">{t("docUnavailable")}</p>
          ) : kind === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={doc.filename}
              onError={onImageError}
              className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain"
            />
          ) : kind === "pdf" ? (
            /* `bg-white`: el PDF se pinta sobre papel blanco aunque el analista
               tenga el tema oscuro, si no el borde del visor se ve roto.
               Si algún día se añade una CSP en `next.config.ts`, tendrá que
               incluir `frame-src` con el host de Supabase o esto deja de cargar. */
            <iframe
              src={`${url}#navpanes=0`}
              title={doc.filename}
              className="h-[65vh] w-full rounded-lg border border-border bg-white sm:h-[70vh]"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FileTypeIcon kind={kind} size={48} />
              <p className="text-sm text-muted">{t("docNoPreview")}</p>
              {dl && (
                <a href={dl} rel="noopener">
                  <Button size="sm">{t("docDownload")}</Button>
                </a>
              )}
              <a
                href={url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <ExternalLink size={14} aria-hidden /> {t("docOpenNewTab")}
              </a>
            </div>
          )}
        </div>

        {docs.length > 1 && (
          /* Los botones son visibles a propósito: con el foco dentro del
             `<iframe>` del PDF, las flechas y Escape las consume el visor del
             navegador y no llegan al `document`. */
          <footer className="flex items-center justify-between border-t border-border px-3 py-2">
            <Button variant="ghost" size="sm" onClick={() => go(-1)}>
              <ChevronLeft size={16} aria-hidden className="mr-1" />
              {t("previous")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => go(1)}>
              {t("next")}
              <ChevronRight size={16} aria-hidden className="ml-1" />
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}

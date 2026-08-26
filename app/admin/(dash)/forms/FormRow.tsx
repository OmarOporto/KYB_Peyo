"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { duplicateForm } from "./actions";

/**
 * Fila de la tabla de formularios: toda la fila navega al editor. El nombre
 * sigue siendo un <Link> real (foco, teclado, abrir en pestaña nueva) y este
 * handler solo añade la comodidad de clicar en cualquier parte de la fila,
 * ignorando los clics que caen sobre otro control (p. ej. Duplicar).
 */
export function FormRow({
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

/**
 * Duplicar pide confirmación antes de enviar: es una acción que crea un
 * formulario y redirige al editor, así que un clic accidental (la fila entera
 * es clickeable) sacaría al analista de la lista sin querer. El botón del modal
 * dispara el submit real del <form> vía `requestSubmit`, igual que el borrado
 * en el builder.
 */
export function DuplicateFormButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("forms");
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      ref={formRef}
      action={duplicateForm.bind(null, id)}
      className="inline-flex"
    >
      <DuplicateTrigger onClick={() => setConfirming(true)} />
      {confirming && (
        <ConfirmDuplicateModal
          title={t("confirmDuplicateTitle")}
          body={t("confirmDuplicateBody", { name })}
          confirmLabel={t("duplicate")}
          cancelLabel={t("cancel")}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            formRef.current?.requestSubmit();
          }}
        />
      )}
    </form>
  );
}

function DuplicateTrigger({ onClick }: { onClick: () => void }) {
  const t = useTranslations("forms");
  const { pending } = useFormStatus();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={t("duplicate")}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted outline-none transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <SpinnerIcon /> : <CopyIcon />}
      {t("duplicate")}
    </button>
  );
}

function ConfirmDuplicateModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
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
    // stopPropagation: el modal vive dentro de la fila clickeable.
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
        aria-label={title}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface-card p-5 shadow-xl"
      >
        <p className="font-display text-base font-semibold text-foreground">
          {title}
        </p>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" autoFocus onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

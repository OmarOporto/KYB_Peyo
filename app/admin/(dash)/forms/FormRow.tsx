"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { archiveForm, deleteForm, duplicateForm, formUsage, type FormUsage } from "./actions";
import { formActionError } from "./formErrors";

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

// Los tres botones de acción comparten el mismo chip para que la columna no
// parezca tres controles distintos.
const ROW_BTN =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const ROW_BTN_NEUTRAL = `${ROW_BTN} text-muted hover:border-brand/40 hover:bg-brand/10 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/30`;
const ROW_BTN_DANGER = `${ROW_BTN} text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/30`;

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
        <ConfirmModal
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
      className={ROW_BTN_NEUTRAL}
    >
      {pending ? <SpinnerIcon /> : <CopyIcon />}
      {t("duplicate")}
    </button>
  );
}

/**
 * Archivar / desarchivar. Reversible, así que no lleva el tono destructivo;
 * pero sí confirma, porque archivar un formulario publicado lo saca de la ruta
 * pública en el acto.
 */
export function ArchiveFormButton({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const t = useTranslations("forms");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    const res = await archiveForm(id, !archived);
    setBusy(false);
    setConfirming(false);
    if (res.ok) router.refresh();
    else setError(formActionError(t, res));
  }

  return (
    <div className="inline-flex">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
        title={archived ? t("unarchive") : t("archive")}
        className={ROW_BTN_NEUTRAL}
      >
        {busy ? <SpinnerIcon /> : <ArchiveIcon />}
        {archived ? t("unarchive") : t("archive")}
      </button>
      {confirming && (
        <ConfirmModal
          title={archived ? t("confirmUnarchiveTitle") : t("confirmArchiveTitle")}
          body={
            archived
              ? t("confirmUnarchiveBody", { name })
              : t("confirmArchiveBody", { name })
          }
          confirmLabel={archived ? t("unarchive") : t("archive")}
          cancelLabel={t("cancel")}
          busy={busy}
          onCancel={() => setConfirming(false)}
          onConfirm={run}
        />
      )}
      {error && (
        <ConfirmModal
          title={t("actionBlockedTitle")}
          body={error}
          confirmLabel={t("close")}
          hideCancel
          onCancel={() => setError(null)}
          onConfirm={() => setError(null)}
        />
      )}
    </div>
  );
}

/**
 * Borrado definitivo (solo admin). Antes de confirmar consulta `formUsage` para
 * poder decir en el diálogo qué se lleva puesto: pedir "¿seguro?" sin nombrar
 * las solicitudes que se van a desvincular es pedir una confirmación a ciegas.
 */
export function DeleteFormButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("forms");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<FormUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onOpen() {
    setBusy(true);
    const u = await formUsage(id);
    setBusy(false);
    if (u.canDelete) setUsage(u);
    else setError(blockedMessage(t, u));
  }

  async function run() {
    setBusy(true);
    const res = await deleteForm(id);
    setBusy(false);
    setUsage(null);
    if (res.ok) router.refresh();
    else setError(formActionError(t, res));
  }

  return (
    <div className="inline-flex">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        title={t("delete")}
        className={ROW_BTN_DANGER}
      >
        {busy ? <SpinnerIcon /> : <TrashIcon />}
        {t("delete")}
      </button>
      {usage && (
        <ConfirmModal
          title={t("confirmDeleteTitle")}
          body={
            usage.requests > 0
              ? t("confirmDeleteBodyWithRequests", { name, count: usage.requests })
              : t("confirmDeleteBody", { name })
          }
          confirmLabel={t("delete")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onCancel={() => setUsage(null)}
          onConfirm={run}
        />
      )}
      {error && (
        <ConfirmModal
          title={t("actionBlockedTitle")}
          body={error}
          confirmLabel={t("close")}
          hideCancel
          onCancel={() => setError(null)}
          onConfirm={() => setError(null)}
        />
      )}
    </div>
  );
}

/** Mismo texto que devolvería el action, pero resuelto antes de intentar. */
function blockedMessage(
  t: (key: string, values?: Record<string, string | number>) => string,
  u: FormUsage,
): string {
  if (u.clients.length > 0) {
    return t("errorAssignedToClient", { clients: u.clients.join(", ") });
  }
  return t("errorRequestsNoSnapshot", { count: u.requestsWithoutSnapshot });
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

function ArchiveIcon() {
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
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
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

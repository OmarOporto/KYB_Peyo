"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveText,
  type Field,
  type FormDefinition,
} from "@/lib/forms/definition";
import {
  nextSectionId,
  visibleFields,
  visibleSections,
  reachableSections,
  reachableFields,
  type Answers,
} from "@/lib/forms/logic";
import { countryOptions } from "@/lib/forms/countries";
import { downscaleImage } from "@/lib/forms/imageCompress";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export type FileRef = { path: string; filename: string };
/** Resultado de una subida: la referencia, o el motivo del fallo para mostrarlo. */
export type UploadResult =
  | { ok: true; ref: FileRef }
  | { ok: false; error?: string };

export interface DynamicFormProps {
  definition: FormDefinition;
  locale: string;
  initialAnswers?: Answers;
  mode?: "live" | "preview";
  onSaveDraft?: (answers: Answers) => Promise<void> | void;
  onUploadFile?: (file: File, field: Field) => Promise<UploadResult>;
  onDeleteFile?: (path: string) => Promise<boolean>;
  onSubmit?: (answers: Answers) => Promise<{ ok: boolean; error?: string }>;
  /** Si se pasa, tras enviar se redirige el navegador a esta URL (app del cliente). */
  returnUrl?: string;
  labels?: {
    back: string;
    continue: string;
    submit: string;
    submitting: string;
    done: string;
    doneBody: string;
    saving: string;
    saved: string;
    saveError?: string;
    submitFailed?: string;
    missingFields?: string;
    required?: string;
    invalidEmail?: string;
    invalidNumber?: string;
    invalid?: string;
    returnCta?: string;
    redirecting?: string;
  };
}

const DEFAULT_LABELS: Required<NonNullable<DynamicFormProps["labels"]>> = {
  back: "Atrás",
  continue: "Continuar",
  submit: "Enviar",
  submitting: "Enviando…",
  done: "¡Enviado!",
  doneBody: "Gracias, tu información fue recibida.",
  saving: "Guardando…",
  saved: "Guardado",
  saveError: "No se pudo guardar",
  submitFailed: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.",
  missingFields: "Faltan {count} campo(s) obligatorio(s). Te llevamos al primero.",
  required: "Requerido",
  invalidEmail: "Email inválido",
  invalidNumber: "Número inválido",
  invalid: "Valor inválido",
  returnCta: "Continuar",
  redirecting: "Redirigiendo…",
};

export function DynamicForm({
  definition,
  locale,
  initialAnswers = {},
  mode = "live",
  onSaveDraft,
  onUploadFile,
  onDeleteFile,
  onSubmit,
  returnUrl,
  labels,
}: DynamicFormProps) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const sections = definition.sections;
  const firstId = useMemo(() => {
    const vis = visibleSections(definition, initialAnswers);
    return (vis[0] ?? sections[0])?.id ?? "";
  }, [definition, initialAnswers, sections]);

  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [currentId, setCurrentId] = useState<string>(firstId);
  const [stack, setStack] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const current = sections.find((s) => s.id === currentId) ?? sections[0];
  const fields = current ? visibleFields(current, answers) : [];

  // Autosave con debounce.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);
  // Siempre apunta a las respuestas más recientes (para guardar al ocultar la pestaña).
  const answersRef = useRef<Answers>(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  // Tras enviar, redirige el navegador de vuelta a la app del cliente (si hay return_url).
  useEffect(() => {
    if (done && returnUrl) {
      const t = setTimeout(() => {
        window.location.href = returnUrl;
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [done, returnUrl]);
  useEffect(() => {
    if (mode !== "live" || !onSaveDraft) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(async () => {
      try {
        await onSaveDraft(answers);
        setSaveState("saved");
      } catch (e) {
        console.error("[DynamicForm] autosave falló", e);
        setSaveState("error");
      }
    }, 1000);
  }, [answers, mode, onSaveDraft]);

  // Guarda ya mismo (cancela el debounce). Se usa al cambiar de sección para no
  // depender de la ventana de 1s si el usuario avanza rápido.
  function flushSave() {
    if (mode !== "live" || !onSaveDraft) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setSaveState("saving");
    Promise.resolve(onSaveDraft(answers))
      .then(() => setSaveState("saved"))
      .catch((e: unknown) => {
        console.error("[DynamicForm] guardado falló", e);
        setSaveState("error");
      });
  }

  // Flush best-effort al ocultar/cerrar la pestaña (no depende del debounce).
  useEffect(() => {
    if (mode !== "live" || !onSaveDraft) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void onSaveDraft(answersRef.current);
    };
    const onPageHide = () => void onSaveDraft(answersRef.current);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [mode, onSaveDraft]);

  function setAnswer(key: string, value: unknown) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  }

  /** Calcula el mapa de errores (key → mensaje) para una lista de campos. Puro. */
  function computeErrors(list: Field[]): Record<string, string> {
    const next: Record<string, string> = {};
    for (const f of list) {
      if (f.type === "note") continue;
      const val = answers[f.key];
      const empty =
        val == null || val === "" || (Array.isArray(val) && val.length === 0);

      // Requerido
      if (f.required) {
        if (f.type === "boolean") {
          if (val !== true) {
            next[f.key] = L.required;
            continue;
          }
        } else if (empty) {
          next[f.key] = L.required;
          continue;
        }
      }
      if (empty) continue; // opcional y vacío → válido

      // Formato (solo si hay valor)
      const v = f.validation ?? {};
      if (f.type === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) next[f.key] = L.invalidEmail;
      } else if (f.type === "number") {
        const n = Number(val);
        if (Number.isNaN(n)) next[f.key] = L.invalidNumber;
        else if ((v.min != null && n < v.min) || (v.max != null && n > v.max))
          next[f.key] = L.invalid;
      } else if (f.type === "short_text" || f.type === "long_text") {
        const s = String(val);
        if (
          (v.minLen != null && s.length < v.minLen) ||
          (v.maxLen != null && s.length > v.maxLen) ||
          (v.pattern && !new RegExp(v.pattern).test(s))
        )
          next[f.key] = L.invalid;
      }
    }
    return next;
  }

  /** Hace scroll + foco al campo con la key dada, si está en el DOM. */
  function scrollToField(key: string) {
    if (!key || typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(
      `[data-field="${CSS.escape(key)}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }

  function validateFields(list: Field[]): boolean {
    const next = computeErrors(list);
    setErrors(next);
    const firstKey = Object.keys(next)[0];
    if (firstKey) scrollToField(firstKey);
    return Object.keys(next).length === 0;
  }

  async function goNext() {
    if (!validateFields(fields)) return;
    const target = nextSectionId(definition, currentId, answers);
    if (target === "SUBMIT") {
      await submit();
    } else {
      flushSave(); // persiste el borrador al avanzar de sección
      setStack((s) => [...s, currentId]);
      setCurrentId(target);
      setErrors({});
    }
  }

  function goBack() {
    flushSave(); // persiste el borrador al retroceder de sección
    setStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setCurrentId(prev);
      return s.slice(0, -1);
    });
    setErrors({});
  }

  async function submit() {
    // Valida TODO el formulario visible. Si falta algo, en vez de un `return`
    // mudo: navega a la sección del primer campo faltante, lo resalta y muestra
    // un mensaje claro (antes esto se veía como un "cuelgue" sin feedback).
    const missing = computeErrors(reachableFields(definition, answers));
    const missingKeys = Object.keys(missing);
    if (missingKeys.length > 0) {
      setErrors(missing);
      const firstKey = missingKeys[0];
      const target = reachableSections(definition, answers).find((s) =>
        s.fields.some((f) => f.key === firstKey),
      );
      if (target && target.id !== currentId) setCurrentId(target.id);
      setSubmitError(L.missingFields.replace("{count}", String(missingKeys.length)));
      // El campo se renderiza tras cambiar de sección → scroll en el próximo tick.
      setTimeout(() => scrollToField(firstKey), 60);
      return;
    }
    if (mode === "preview" || !onSubmit) {
      setDone(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await onSubmit(answers);
      if (res.ok) setDone(true);
      else setSubmitError(res.error ?? L.submitFailed);
    } catch (e) {
      // Backstop: si la Server Action lanza (p. ej. el body excede el límite
      // del framework), esto evita el fallo silencioso sin loading ni error.
      console.error("[DynamicForm] submit falló", e);
      setSubmitError(L.submitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const isLast = nextSectionId(definition, currentId, answers) === "SUBMIT";

  if (done) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-2xl text-success">
          ✓
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">{L.done}</h2>
        <p className="mt-2 text-muted">{L.doneBody}</p>
        {returnUrl && (
          <div className="mt-6">
            <a
              href={returnUrl}
              className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              {L.returnCta}
            </a>
            <p className="mt-2 text-xs text-muted">{L.redirecting}</p>
          </div>
        )}
      </Card>
    );
  }

  if (!current) return null;

  const visSecs = reachableSections(definition, answers);
  const stepIdx = visSecs.findIndex((s) => s.id === current.id);
  const progress = visSecs.length ? ((stepIdx + 1) / visSecs.length) * 100 : 0;

  return (
    <div>
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">
            {resolveText(current.title, locale) || `#${stepIdx + 1}`}
          </span>
          {mode === "live" && (
            <span className={saveState === "error" ? "text-danger" : "text-muted"}>
              {saveState === "saving"
                ? L.saving
                : saveState === "saved"
                  ? L.saved
                  : saveState === "error"
                    ? L.saveError
                    : ""}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-1.5 rounded-full bg-linear-to-r from-brand to-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Card className="p-6">
        {current.description && (
          <p className="mb-4 text-sm text-muted">
            {resolveText(current.description, locale)}
          </p>
        )}
        <div className="space-y-4">
          {fields.map((f) => (
            <FieldInput
              key={f.id}
              field={f}
              locale={locale}
              value={answers[f.key]}
              error={errors[f.key]}
              onChange={(v) => setAnswer(f.key, v)}
              onUploadFile={onUploadFile}
              onDeleteFile={onDeleteFile}
            />
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-muted">—</p>
          )}
        </div>

        {submitError && <p className="mt-4 text-sm text-danger">{submitError}</p>}

        <div className="mt-6 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={stack.length === 0}
            onClick={goBack}
          >
            ← {L.back}
          </Button>
          {isLast ? (
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? L.submitting : L.submit}
            </Button>
          ) : (
            <Button type="button" onClick={goNext}>
              {L.continue} →
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Campo individual
// ============================================================
const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30";

function FieldInput({
  field,
  locale,
  value,
  error,
  onChange,
  onUploadFile,
  onDeleteFile,
}: {
  field: Field;
  locale: string;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  onUploadFile?: (file: File, field: Field) => Promise<UploadResult>;
  onDeleteFile?: (path: string) => Promise<boolean>;
}) {
  const label = resolveText(field.label, locale);
  const placeholder = resolveText(field.placeholder, locale);
  const help = resolveText(field.help, locale);
  const options = field.options ?? [];

  // Nota / encabezado: solo texto, sin input ni respuesta.
  if (field.type === "note") {
    return (
      <div className="border-b border-border pb-1 pt-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</p>
        {help && <p className="mt-0.5 text-xs text-muted">{help}</p>}
        {field.image && (
          <HelpImage
            src={field.image}
            wrapperClassName="mt-2 block w-fit"
            className="max-h-56 rounded-lg border border-border"
          />
        )}
      </div>
    );
  }

  return (
    <div data-field={field.key}>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label || "—"}
        {field.required && <span className="text-danger"> *</span>}
      </label>
      {field.image && (
        <HelpImage
          src={field.image}
          wrapperClassName="mb-2 block w-fit"
          className="max-h-56 rounded-lg border border-border"
        />
      )}

      {field.type === "long_text" ? (
        <textarea
          className={inputCls}
          rows={3}
          placeholder={placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "single_choice" ? (
        <div className="space-y-1.5">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                className="accent-brand"
                checked={String(value ?? "") === o.value}
                onChange={() => onChange(o.value)}
              />
              <span>{resolveText(o.label, locale)}</span>
              {o.image && (
                <HelpImage
                  src={o.image}
                  wrapperClassName="shrink-0"
                  className="h-12 w-12 rounded border border-border object-cover"
                />
              )}
            </label>
          ))}
        </div>
      ) : field.type === "multiple_choice" ? (
        <div className="space-y-1.5">
          {options.map((o) => {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={arr.includes(o.value)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...arr, o.value]
                        : arr.filter((x) => x !== o.value),
                    )
                  }
                />
                <span>{resolveText(o.label, locale)}</span>
                {o.image && (
                  <HelpImage
                    src={o.image}
                    wrapperClassName="shrink-0"
                    className="h-12 w-12 rounded border border-border object-cover"
                  />
                )}
              </label>
            );
          })}
        </div>
      ) : field.type === "dropdown" ? (
        <select
          className={inputCls}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {resolveText(o.label, locale)}
            </option>
          ))}
        </select>
      ) : field.type === "country" ? (
        <CountryField value={value} onChange={onChange} locale={locale} />
      ) : field.type === "file" ? (
        <FileField
          field={field}
          value={value}
          onChange={onChange}
          onUploadFile={onUploadFile}
          onDeleteFile={onDeleteFile}
          locale={locale}
        />
      ) : field.type === "selfie" ? (
        <SelfieField
          field={field}
          value={value}
          onChange={onChange}
          onUploadFile={onUploadFile}
          onDeleteFile={onDeleteFile}
          locale={locale}
        />
      ) : field.type === "boolean" ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="accent-brand"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{placeholder || label}</span>
        </label>
      ) : (
        <input
          type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          className={inputCls}
          placeholder={placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {help && <p className="mt-1 text-xs text-muted">{help}</p>}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

/** Imagen de ayuda (pregunta u opción). Clickeable para verla en grande. */
function HelpImage({
  src,
  className,
  wrapperClassName,
}: {
  src: string;
  className: string;
  wrapperClassName?: string;
}) {
  return (
    <a href={src} target="_blank" rel="noopener" className={wrapperClassName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={className} />
    </a>
  );
}

// ---------- Selector de país (combobox buscable; valor = ISO alpha-3) ----------
const COUNTRY_SEARCH = { es: "Buscar país…", en: "Search country…" };

function CountryField({
  value,
  onChange,
  locale,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => countryOptions(locale), [locale]);
  const selected = options.find((c) => c.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((c) => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q))
    : options;
  const searchPlaceholder = locale === "en" ? COUNTRY_SEARCH.en : COUNTRY_SEARCH.es;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between text-left`}
      >
        <span className={selected ? "" : "text-muted"}>
          {selected ? `${selected.flag} ${selected.name}` : "—"}
        </span>
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 z-20 mt-1 w-full rounded-lg border border-border bg-surface-card shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
            />
            <div className="max-h-56 overflow-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-1 text-xs text-muted">—</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => {
                      onChange(c.value);
                      setQuery("");
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${
                      c.value === value ? "font-semibold text-brand" : "text-foreground"
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const FILE_TEXT = {
  es: {
    upError: "No se pudo subir el archivo. Intenta de nuevo.",
    delError: "No se pudo eliminar el archivo. Intenta de nuevo.",
    choose: "Elegir archivo",
    remove: "Quitar",
  },
  en: {
    upError: "Could not upload the file. Try again.",
    delError: "Could not remove the file. Try again.",
    choose: "Choose file",
    remove: "Remove",
  },
} as const;

function FileField({
  field,
  value,
  onChange,
  onUploadFile,
  onDeleteFile,
  locale,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  onUploadFile?: (file: File, field: Field) => Promise<UploadResult>;
  onDeleteFile?: (path: string) => Promise<boolean>;
  locale: string;
}) {
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const refs = Array.isArray(value) ? (value as FileRef[]) : [];
  const cfg = field.file;
  const T = locale === "en" ? FILE_TEXT.en : FILE_TEXT.es;

  async function removeAt(i: number) {
    const ref = refs[i];
    if (!ref) return;
    setErr(null);
    setRemoving(i);
    try {
      if (ref.path && onDeleteFile) {
        const ok = await onDeleteFile(ref.path);
        if (!ok) {
          setErr(T.delError);
          return;
        }
      }
      onChange(refs.filter((_, idx) => idx !== i));
    } catch (delErr) {
      console.error("[FileField] borrado falló", delErr);
      setErr(T.delError);
    } finally {
      setRemoving(null);
    }
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setErr(null);
    setBusy(true);
    const added: FileRef[] = [];
    try {
      for (const file of files) {
        if (cfg?.maxSizeMB && file.size > cfg.maxSizeMB * 1024 * 1024) {
          setErr(`> ${cfg.maxSizeMB} MB`);
          continue;
        }
        if (onUploadFile) {
          // Comprime imágenes grandes antes de subir (los no-imagen pasan intactos).
          const toUpload = await downscaleImage(file, { maxDim: 2000, quality: 0.85 });
          const res = await onUploadFile(toUpload, field);
          if (res.ok) added.push(res.ref);
          // Mostrar el motivo real (p. ej. error de storage / invitación) en vez del genérico.
          else setErr(res.error || T.upError);
        } else {
          added.push({ path: "", filename: file.name });
        }
      }
    } catch (uploadErr) {
      // Backstop: si la Server Action lanza (p. ej. el archivo excede el límite
      // de body del framework), mostrar el error en vez de quedar en silencio.
      console.error("[FileField] subida falló", uploadErr);
      setErr(T.upError);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
    if (added.length) onChange(cfg?.multiple ? [...refs, ...added] : added.slice(-1));
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <span className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
          {busy ? "…" : T.choose}
        </span>
        <input
          type="file"
          multiple={cfg?.multiple}
          accept={cfg?.accept?.length ? cfg.accept.join(",") : undefined}
          disabled={busy}
          onChange={onFiles}
          className="hidden"
        />
      </label>
      {cfg?.accept?.length ? (
        <p className="mt-1 text-xs text-muted">{cfg.accept.join(", ")}</p>
      ) : null}
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      {refs.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {refs.map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-muted">
              <span className="text-success">✓</span>
              <span className="min-w-0 flex-1 truncate">{r.filename}</span>
              <button
                type="button"
                className="shrink-0 cursor-pointer text-xs text-danger hover:underline disabled:opacity-50"
                onClick={() => removeAt(i)}
                disabled={removing !== null || busy}
              >
                {removing === i ? "…" : T.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Captura de selfie por cámara (solo en vivo) ----------
const SELFIE_TEXT = {
  es: {
    start: "Encender cámara",
    capture: "Tomar foto",
    retake: "Volver a tomar",
    cancel: "Cancelar",
    captured: "Selfie capturada",
    camError: "No se pudo acceder a la cámara. Concede el permiso y usa un dispositivo con cámara.",
    upError: "No se pudo subir la foto. Intenta de nuevo.",
    uploading: "Subiendo…",
  },
  en: {
    start: "Turn on camera",
    capture: "Take photo",
    retake: "Retake",
    cancel: "Cancel",
    captured: "Selfie captured",
    camError: "Could not access the camera. Grant permission and use a device with a camera.",
    upError: "Could not upload the photo. Try again.",
    uploading: "Uploading…",
  },
} as const;

function SelfieField({
  field,
  value,
  onChange,
  onUploadFile,
  onDeleteFile,
  locale,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  onUploadFile?: (file: File, field: Field) => Promise<UploadResult>;
  onDeleteFile?: (path: string) => Promise<boolean>;
  locale: string;
}) {
  const t = SELFIE_TEXT[locale === "en" ? "en" : "es"];
  const refs = Array.isArray(value) ? (value as FileRef[]) : [];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const thumbUrlRef = useRef<string | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setActive(false);
  }
  function revokeThumb() {
    if (thumbUrlRef.current) {
      URL.revokeObjectURL(thumbUrlRef.current);
      thumbUrlRef.current = null;
    }
  }

  // Adjunta el stream al <video> cuando la cámara se enciende.
  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [active]);

  // Limpieza al desmontar.
  useEffect(() => {
    return () => {
      stopCamera();
      revokeThumb();
    };
  }, []);

  async function startCamera() {
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr(t.camError);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
    } catch {
      setErr(t.camError);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    // Reescala al lado mayor ≤ 1600px para no capturar a resolución completa de
    // cámara (archivos enormes que ralentizan subida y verificación).
    const SELFIE_MAX_DIM = 1600;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(vw, vh) > SELFIE_MAX_DIM ? SELFIE_MAX_DIM / Math.max(vw, vh) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.85),
    );
    if (!blob) return;
    const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" });

    stopCamera();
    revokeThumb();
    const url = URL.createObjectURL(blob);
    thumbUrlRef.current = url;
    setThumb(url);

    setErr(null);
    setBusy(true);
    try {
      if (onUploadFile) {
        const res = await onUploadFile(file, field);
        if (res.ok) {
          onChange([res.ref]);
        } else {
          setErr(res.error || t.upError);
          revokeThumb();
          setThumb(null);
        }
      } else {
        onChange([{ path: "", filename: file.name }]);
      }
    } catch (uploadErr) {
      // Backstop ante un throw de la Server Action (p. ej. límite de body).
      console.error("[SelfieField] subida falló", uploadErr);
      setErr(t.upError);
      revokeThumb();
      setThumb(null);
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    // Borra la foto previa ya subida para no dejar huérfanos en Storage.
    const prev = refs[0]?.path;
    if (prev && onDeleteFile) void onDeleteFile(prev);
    revokeThumb();
    setThumb(null);
    setErr(null);
    onChange([]);
    startCamera();
  }

  const hasCapture = refs.length > 0 || thumb != null;

  return (
    <div>
      {active ? (
        <div className="space-y-2">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-xs rounded-lg border border-border bg-black"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={capture} disabled={busy}>
              {t.capture}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={stopCamera}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : hasCapture ? (
        <div className="space-y-2">
          {thumb && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb}
                alt=""
                className="w-full max-w-xs rounded-lg border border-border"
              />
            </>
          )}
          <p className="text-sm text-muted">
            <span className="text-success">✓</span> {t.captured}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={retake} disabled={busy}>
            {t.retake}
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" onClick={startCamera} disabled={busy}>
          {t.start}
        </Button>
      )}
      {busy && <p className="mt-1 text-sm text-muted">{t.uploading}</p>}
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
    </div>
  );
}

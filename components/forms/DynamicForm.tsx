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
  allVisibleFields,
  type Answers,
} from "@/lib/forms/logic";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export type FileRef = { path: string; filename: string };

export interface DynamicFormProps {
  definition: FormDefinition;
  locale: string;
  initialAnswers?: Answers;
  mode?: "live" | "preview";
  onSaveDraft?: (answers: Answers) => Promise<void> | void;
  onUploadFile?: (file: File, field: Field) => Promise<FileRef | null>;
  onSubmit?: (answers: Answers) => Promise<{ ok: boolean; error?: string }>;
  labels?: {
    back: string;
    continue: string;
    submit: string;
    submitting: string;
    done: string;
    doneBody: string;
    saving: string;
    saved: string;
    required?: string;
    invalidEmail?: string;
    invalidNumber?: string;
    invalid?: string;
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
  required: "Requerido",
  invalidEmail: "Email inválido",
  invalidNumber: "Número inválido",
  invalid: "Valor inválido",
};

export function DynamicForm({
  definition,
  locale,
  initialAnswers = {},
  mode = "live",
  onSaveDraft,
  onUploadFile,
  onSubmit,
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const current = sections.find((s) => s.id === currentId) ?? sections[0];
  const fields = current ? visibleFields(current, answers) : [];

  // Autosave con debounce.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (mode !== "live" || !onSaveDraft) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(async () => {
      await onSaveDraft(answers);
      setSaveState("saved");
    }, 1000);
  }, [answers, mode, onSaveDraft]);

  function setAnswer(key: string, value: unknown) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: "" } : e));
  }

  function validateFields(list: Field[]): boolean {
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

    setErrors(next);
    const firstKey = Object.keys(next)[0];
    if (firstKey && typeof document !== "undefined") {
      const el = document.querySelector<HTMLElement>(
        `[data-field="${CSS.escape(firstKey)}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, textarea, select")?.focus();
    }
    return Object.keys(next).length === 0;
  }

  async function goNext() {
    if (!validateFields(fields)) return;
    const target = nextSectionId(definition, currentId, answers);
    if (target === "SUBMIT") {
      await submit();
    } else {
      setStack((s) => [...s, currentId]);
      setCurrentId(target);
      setErrors({});
    }
  }

  function goBack() {
    setStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1];
      setCurrentId(prev);
      return s.slice(0, -1);
    });
    setErrors({});
  }

  async function submit() {
    if (!validateFields(allVisibleFields(definition, answers))) return;
    if (mode === "preview" || !onSubmit) {
      setDone(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const res = await onSubmit(answers);
    setSubmitting(false);
    if (res.ok) setDone(true);
    else setSubmitError(res.error ?? "Error");
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
      </Card>
    );
  }

  if (!current) return null;

  const visSecs = visibleSections(definition, answers);
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
            <span className="text-muted">
              {saveState === "saving" ? L.saving : saveState === "saved" ? L.saved : ""}
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
}: {
  field: Field;
  locale: string;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  onUploadFile?: (file: File, field: Field) => Promise<FileRef | null>;
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
      </div>
    );
  }

  return (
    <div data-field={field.key}>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label || "—"}
        {field.required && <span className="text-danger"> *</span>}
      </label>
      {help && <p className="mb-1 text-xs text-muted">{help}</p>}

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
      ) : field.type === "file" ? (
        <FileField field={field} value={value} onChange={onChange} onUploadFile={onUploadFile} />
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

      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

function FileField({
  field,
  value,
  onChange,
  onUploadFile,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  onUploadFile?: (file: File, field: Field) => Promise<FileRef | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refs = Array.isArray(value) ? (value as FileRef[]) : [];
  const cfg = field.file;

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setErr(null);
    setBusy(true);
    const added: FileRef[] = [];
    for (const file of files) {
      if (cfg?.maxSizeMB && file.size > cfg.maxSizeMB * 1024 * 1024) {
        setErr(`> ${cfg.maxSizeMB} MB`);
        continue;
      }
      if (onUploadFile) {
        const ref = await onUploadFile(file, field);
        if (ref) added.push(ref);
      } else {
        added.push({ path: "", filename: file.name });
      }
    }
    setBusy(false);
    e.target.value = "";
    onChange(cfg?.multiple ? [...refs, ...added] : added.slice(-1));
  }

  return (
    <div>
      <input
        type="file"
        multiple={cfg?.multiple}
        accept={cfg?.accept?.length ? cfg.accept.join(",") : undefined}
        disabled={busy}
        onChange={onFiles}
        className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-hover"
      />
      {cfg?.accept?.length ? (
        <p className="mt-1 text-xs text-muted">{cfg.accept.join(", ")}</p>
      ) : null}
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
      {refs.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {refs.map((r, i) => (
            <li key={i} className="text-muted">
              <span className="text-success">✓</span> {r.filename}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import "server-only";
import { resolveText, type FormDefinition } from "@/lib/forms/definition";
import { renderAnswer, fileRefsOf } from "@/lib/forms/answers";
import { allVisibleFields, type Answers } from "@/lib/forms/logic";

export type SerializedAnswer = {
  key: string;
  label: string;
  type: string;
  value: string; // legible (renderAnswer)
  raw: unknown; // valor crudo tal como se guardó
  files?: { filename: string; url: string | null }[];
};

function isEmpty(v: unknown): boolean {
  return v == null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Todas las refs de archivo (file/selfie) del data, para firmarlas de una vez. */
export function collectFileRefs(
  definition: FormDefinition | null,
  data: Record<string, unknown>,
): { path: string; filename: string }[] {
  if (!definition) return [];
  return definition.sections.flatMap((s) =>
    s.fields
      .filter((f) => f.type === "file" || f.type === "selfie")
      .flatMap((f) => fileRefsOf(data[f.key])),
  );
}

/** Respuestas mapeadas a etiquetas legibles + URLs firmadas para file/selfie. */
export function serializeAnswers(
  definition: FormDefinition | null,
  data: Record<string, unknown>,
  signedUrls: Record<string, string>,
  locale: string,
): SerializedAnswer[] {
  if (!definition) {
    // Sin definición (solicitud vieja): exponer el data crudo.
    return Object.entries(data).map(([key, raw]) => ({
      key,
      label: key,
      type: "unknown",
      value: typeof raw === "object" ? JSON.stringify(raw) : String(raw ?? ""),
      raw,
    }));
  }
  const out: SerializedAnswer[] = [];
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (field.type === "note") continue;
      const raw = data[field.key];
      const entry: SerializedAnswer = {
        key: field.key,
        label: resolveText(field.label, locale) || field.key,
        type: field.type,
        value: renderAnswer(field, raw, locale),
        raw,
      };
      if (field.type === "file" || field.type === "selfie") {
        entry.files = fileRefsOf(raw).map((r) => ({
          filename: r.filename,
          url: signedUrls[r.path] ?? null,
        }));
      }
      out.push(entry);
    }
  }
  return out;
}

export type DraftProgress = {
  total: number;
  filled: number;
  percent: number;
  fields: { key: string; label: string; filled: boolean; required: boolean }[];
};

/** Avance del borrador: campos visibles llenos vs total (respeta lógica condicional). */
export function computeDraftProgress(
  definition: FormDefinition | null,
  data: Record<string, unknown>,
  locale: string,
): DraftProgress {
  if (!definition) {
    const keys = Object.keys(data);
    const fields = keys.map((k) => ({
      key: k,
      label: k,
      filled: !isEmpty(data[k]),
      required: false,
    }));
    const filled = fields.filter((f) => f.filled).length;
    return {
      total: fields.length,
      filled,
      percent: fields.length ? Math.round((filled / fields.length) * 100) : 0,
      fields,
    };
  }
  const visible = allVisibleFields(definition, data as Answers).filter(
    (f) => f.type !== "note",
  );
  const fields = visible.map((f) => ({
    key: f.key,
    label: resolveText(f.label, locale) || f.key,
    filled: !isEmpty(data[f.key]),
    required: Boolean(f.required),
  }));
  const filled = fields.filter((f) => f.filled).length;
  return {
    total: fields.length,
    filled,
    percent: fields.length ? Math.round((filled / fields.length) * 100) : 0,
    fields,
  };
}

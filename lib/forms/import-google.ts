import {
  uid,
  type Field,
  type FieldType,
  type FormDefinition,
  type NavRule,
  type Section,
} from "./definition";

// ============================================================
// Tipos parciales del export de Google Forms
// ============================================================
interface GOption {
  label?: string;
}
interface GField {
  id?: string;
  type?: string;
  appComponent?: string;
  title?: string;
  description?: string;
  required?: boolean | null;
  validationHint?: string;
  options?: GOption[];
}
interface GNext {
  action?: string;
  targetSectionId?: string | null;
}
interface GSection {
  id?: string;
  title?: string;
  fields?: GField[];
  defaultNext?: GNext;
}
interface GTransition {
  type?: string;
  fromSectionId?: string;
  fromFieldId?: string | null;
  condition?: string;
  action?: string;
  toSectionId?: string | null;
}
interface GExport {
  form?: { title?: string; description?: string };
  sections?: GSection[];
  transitions?: GTransition[];
}

/** ¿El JSON parece un export de Google Forms (no nuestro FormDefinition)? */
export function isGoogleFormExport(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const o = json as GExport & { version?: unknown };
  if (o.version === 1) return false; // es nuestro FormDefinition
  if (!Array.isArray(o.sections)) return false;
  const s0 = o.sections[0] as GSection | undefined;
  const looksGoogle =
    !!s0 &&
    Array.isArray(s0.fields) &&
    s0.fields.some(
      (f) =>
        !!f &&
        (f.appComponent != null ||
          (typeof f.type === "string" &&
            /MULTIPLE_CHOICE|PARAGRAPH_TEXT|FILE_UPLOAD|SECTION_HEADER|LIST/.test(f.type))),
    );
  return Boolean(o.form && (looksGoogle || Array.isArray(o.transitions)));
}

// ============================================================
// Mapeo de tipos
// ============================================================
function mapType(f: GField): FieldType {
  switch ((f.type ?? "").toUpperCase()) {
    case "PARAGRAPH_TEXT":
      return "long_text";
    case "MULTIPLE_CHOICE": // Google = selección única (radios)
      return "single_choice";
    case "CHECKBOX":
      return "multiple_choice";
    case "LIST":
      return "dropdown";
    case "FILE_UPLOAD":
      return "file";
    case "DATE":
      return "date";
    case "SECTION_HEADER":
      return "note";
    case "TEXT":
    default:
      if (f.validationHint === "number") return "number";
      if (f.validationHint === "email") return "email";
      return "short_text";
  }
}

function toField(f: GField): Field {
  const type = mapType(f);
  const field: Field = {
    id: uid(),
    key: f.id || `f_${uid().slice(0, 8)}`,
    type,
    label: f.title ?? "",
    required: f.required === true,
  };
  if (f.description) field.help = f.description;
  if ((type === "single_choice" || type === "multiple_choice" || type === "dropdown") && f.options) {
    field.options = f.options
      .filter((o) => o.label != null)
      .map((o) => ({ value: o.label as string, label: o.label as string }));
  }
  if (type === "file") field.file = { accept: [], multiple: false, maxSizeMB: 15 };
  return field;
}

/** Extrae la etiqueta de una condición `q_X == "Label"`. */
function optionLabelFromCondition(cond?: string): string | null {
  if (!cond) return null;
  const m = cond.match(/==\s*"([\s\S]*)"\s*$/);
  return m ? m[1] : null;
}

function resolveGoTo(next?: GNext): string | undefined {
  if (!next) return undefined;
  if (next.action === "SUBMIT" || !next.targetSectionId) return "SUBMIT";
  return next.targetSectionId;
}

/** Convierte un export de Google Forms a nuestro FormDefinition. */
export function fromGoogleForm(json: unknown): FormDefinition {
  const data = (json ?? {}) as GExport;

  // Reglas de salto por sección (desde transitions OPTION_SELECTED).
  const rulesBySection: Record<string, NavRule[]> = {};
  for (const tr of data.transitions ?? []) {
    if (tr.type !== "OPTION_SELECTED" || !tr.fromSectionId || !tr.fromFieldId) continue;
    const label = optionLabelFromCondition(tr.condition);
    if (label == null) continue;
    const goTo = !tr.toSectionId || tr.action === "SUBMIT" ? "SUBMIT" : tr.toSectionId;
    (rulesBySection[tr.fromSectionId] ??= []).push({
      when: { field: tr.fromFieldId, op: "eq", value: label },
      goTo,
    });
  }

  const sections: Section[] = (data.sections ?? []).map((s) => {
    const section: Section = {
      id: s.id || uid(),
      title: s.title ?? "",
      fields: (s.fields ?? []).map(toField),
    };
    const rules = s.id ? rulesBySection[s.id] : undefined;
    if (rules && rules.length) section.next = rules;
    const def = resolveGoTo(s.defaultNext);
    if (def) section.defaultGoTo = def;
    return section;
  });

  return {
    version: 1,
    title: data.form?.title ?? "Formulario importado",
    locales: ["es", "en"],
    defaultLocale: "es",
    sections,
  };
}

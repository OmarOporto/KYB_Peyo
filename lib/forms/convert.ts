import type {
  NormalizedQuestionnaire,
  NormalizedWorkflowForm,
  NormalizedQuestion,
  NormalizedSection,
} from "@/lib/didit/questionnaires";
import {
  uid,
  type Field,
  type FieldType,
  type FormDefinition,
  type Section,
} from "./definition";

function mapType(elementType: string | null): FieldType {
  switch ((elementType ?? "").toUpperCase()) {
    case "LONG_TEXT":
    case "TEXTAREA":
      return "long_text";
    case "SINGLE_CHOICE":
      return "single_choice";
    case "MULTIPLE_CHOICE":
      return "multiple_choice";
    case "DROPDOWN":
    case "SELECT":
      return "dropdown";
    case "FILE_UPLOAD":
    case "FILE":
      return "file";
    case "DATE":
      return "date";
    case "NUMBER":
      return "number";
    case "EMAIL":
      return "email";
    case "SHORT_TEXT":
    default:
      return "short_text";
  }
}

function toField(q: NormalizedQuestion, usedKeys: Set<string>): Field {
  const type = mapType(q.type);
  let key = q.id ? `q_${q.id.slice(0, 8)}` : `f_${uid().slice(0, 8)}`;
  while (usedKeys.has(key)) key = `${key}_${uid().slice(0, 4)}`;
  usedKeys.add(key);

  const field: Field = {
    id: uid(),
    key,
    type,
    label: q.label,
    required: q.required,
  };
  if (q.placeholder) field.placeholder = q.placeholder;
  if (q.options && q.options.length) {
    field.options = q.options.map((o) => ({ value: o.value, label: o.label }));
  }
  if (type === "file") field.file = { accept: [], multiple: false, maxSizeMB: 15 };
  return field;
}

function toSection(s: NormalizedSection, usedKeys: Set<string>): Section {
  return {
    id: uid(),
    title: s.title,
    fields: s.questions.map((q) => toField(q, usedKeys)),
  };
}

/** Convierte un cuestionario/workflow normalizado de DIDIT a FormDefinition editable. */
export function fromDidit(
  normalized: NormalizedQuestionnaire | NormalizedWorkflowForm,
): FormDefinition {
  const usedKeys = new Set<string>();
  const src = normalized.source;
  const title =
    "label" in src ? (src.label ?? "Formulario") : (src.title ?? "Formulario");
  const languages = src.languages && src.languages.length ? src.languages : ["es", "en"];

  return {
    version: 1,
    title,
    locales: languages,
    defaultLocale: src.defaultLanguage ?? languages[0] ?? "es",
    sections: normalized.sections.map((s) => toSection(s, usedKeys)),
  };
}

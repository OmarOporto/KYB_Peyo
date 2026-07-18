import type {
  Condition,
  Field,
  FormDefinition,
  Section,
} from "./definition";
import { SUBMIT } from "./definition";

export type Answers = Record<string, unknown>;

function valuesEqual(answer: unknown, value: unknown): boolean {
  if (Array.isArray(answer)) return answer.map(String).includes(String(value));
  return String(answer ?? "") === String(value ?? "");
}

export function isAnswered(a: unknown): boolean {
  if (a == null) return false;
  if (typeof a === "string") return a.trim() !== "";
  if (Array.isArray(a)) return a.length > 0;
  return true;
}

/** Evalúa una condición contra las respuestas actuales. */
export function evaluateCondition(cond: Condition, answers: Answers): boolean {
  if ("all" in cond) return cond.all.every((c) => evaluateCondition(c, answers));
  if ("any" in cond) return cond.any.some((c) => evaluateCondition(c, answers));

  const a = answers[cond.field];
  switch (cond.op) {
    case "answered":
      return isAnswered(a);
    case "eq":
      return valuesEqual(a, cond.value);
    case "neq":
      return !valuesEqual(a, cond.value);
    case "in": {
      const vals = Array.isArray(cond.value) ? cond.value : [cond.value];
      if (Array.isArray(a)) return a.some((x) => vals.map(String).includes(String(x)));
      return vals.map(String).includes(String(a));
    }
    case "not_in": {
      const vals = Array.isArray(cond.value) ? cond.value : [cond.value];
      if (Array.isArray(a)) return !a.some((x) => vals.map(String).includes(String(x)));
      return !vals.map(String).includes(String(a));
    }
    case "gt":
      return Number(a) > Number(cond.value);
    case "lt":
      return Number(a) < Number(cond.value);
    default:
      return true;
  }
}

/** ¿Es visible una sección o campo (según su visibleIf)? */
export function isVisible(
  node: { visibleIf?: Condition },
  answers: Answers,
): boolean {
  return !node.visibleIf || evaluateCondition(node.visibleIf, answers);
}

/** Campos visibles de una sección dado el estado de respuestas. */
export function visibleFields(section: Section, answers: Answers): Field[] {
  return section.fields.filter((f) => isVisible(f, answers));
}

/** Secciones visibles del formulario. */
export function visibleSections(def: FormDefinition, answers: Answers): Section[] {
  return def.sections.filter((s) => isVisible(s, answers));
}

/**
 * Id de la siguiente sección a mostrar tras `currentId`, aplicando reglas de
 * salto (`next`) y saltando secciones ocultas. Devuelve "SUBMIT" si termina.
 */
export function nextSectionId(
  def: FormDefinition,
  currentId: string,
  answers: Answers,
): string {
  const idx = def.sections.findIndex((s) => s.id === currentId);
  if (idx === -1) return SUBMIT;
  const cur = def.sections[idx];

  // Reglas de salto explícitas (la primera que matchea gana).
  if (cur.next) {
    for (const rule of cur.next) {
      if (evaluateCondition(rule.when, answers)) return rule.goTo;
    }
  }
  // Salto por defecto de la sección (ej. importado de Google Forms).
  if (cur.defaultGoTo) return cur.defaultGoTo;
  // Por defecto: la siguiente sección visible en orden.
  for (let i = idx + 1; i < def.sections.length; i++) {
    if (isVisible(def.sections[i], answers)) return def.sections[i].id;
  }
  return SUBMIT;
}

/** Todos los campos visibles del formulario (por `visibleIf`, sin considerar saltos). */
export function allVisibleFields(def: FormDefinition, answers: Answers): Field[] {
  return visibleSections(def, answers).flatMap((s) => visibleFields(s, answers));
}

/**
 * Secciones realmente ALCANZADAS siguiendo el flujo de saltos (`next`/
 * `defaultGoTo`) desde la primera sección visible hasta SUBMIT. A diferencia de
 * `visibleSections` (que solo mira `visibleIf`), respeta el branching: una
 * sección a la que solo se llega por una rama NO tomada no se incluye. Úsese
 * para la validación de envío, así no se exigen campos de ramas inaplicables.
 */
export function reachableSections(def: FormDefinition, answers: Answers): Section[] {
  const start = visibleSections(def, answers)[0] ?? def.sections[0];
  if (!start) return [];
  const byId = new Map(def.sections.map((s) => [s.id, s] as const));
  const visited: Section[] = [];
  const seen = new Set<string>();
  let curId: string = start.id;
  while (curId && curId !== SUBMIT && !seen.has(curId)) {
    seen.add(curId);
    const sec = byId.get(curId);
    if (sec) visited.push(sec);
    curId = nextSectionId(def, curId, answers);
  }
  return visited;
}

/** Campos a validar en el envío: los de las secciones alcanzadas por el flujo. */
export function reachableFields(def: FormDefinition, answers: Answers): Field[] {
  return reachableSections(def, answers).flatMap((s) => visibleFields(s, answers));
}

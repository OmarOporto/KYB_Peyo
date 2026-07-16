// ============================================================
// Catálogo de packs de campos prearmados
// ------------------------------------------------------------
// client-safe: solo depende de tipos/helpers de definition.ts.
// Agregar packs futuros = crear su módulo y hacer append a
// FIELD_PRESETS.
// ============================================================
import {
  uid,
  type Condition,
  type Field,
  type LocalizedText,
  type Section,
} from "@/lib/forms/definition";
import { bridgeKybPreset } from "./bridge-kyb";
import { diditKycPreset } from "./didit-kyc";

export type FieldPreset = {
  id: string;
  label: LocalizedText;
  description?: LocalizedText;
  sections: Section[];
};

/** Packs disponibles en el selector del builder. */
export const FIELD_PRESETS: FieldPreset[] = [bridgeKybPreset, diditKycPreset];

// ------------------------------------------------------------
// Condiciones: refs y combinación
// ------------------------------------------------------------
/** Keys de campo referenciadas por una condición (hojas + grupos all/any). */
export function conditionRefs(cond: Condition | undefined): string[] {
  if (!cond) return [];
  if ("all" in cond) return cond.all.flatMap(conditionRefs);
  if ("any" in cond) return cond.any.flatMap(conditionRefs);
  return [cond.field];
}

/** Combina dos condiciones con AND, aplanando grupos `all`. */
export function andConditions(a?: Condition, b?: Condition): Condition | undefined {
  const parts: Condition[] = [];
  const push = (c?: Condition) => {
    if (!c) return;
    if ("all" in c) parts.push(...c.all);
    else parts.push(c);
  };
  push(a);
  push(b);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return { all: parts };
}

/** Copia del campo con el `visibleIf` de su sección plegado en el propio. */
function effectiveField(field: Field, sectionVisibleIf?: Condition): Field {
  const vi = andConditions(sectionVisibleIf, field.visibleIf);
  return vi ? { ...field, visibleIf: vi } : { ...field };
}

// ------------------------------------------------------------
// Vista para el picker: categorías → campos seleccionables
// ------------------------------------------------------------
export type PresetItem = { key: string; label: LocalizedText; field: Field };
export type PresetCategory = { id: string; label: LocalizedText; items: PresetItem[] };

/**
 * Aplana las secciones del pack a categorías con sus campos seleccionables.
 * Excluye `note` (encabezados). El `field` de cada item lleva el visibleIf
 * efectivo (sección + campo) para conservar el gating al insertarlo en otra
 * sección.
 */
export function presetCategories(preset: FieldPreset): PresetCategory[] {
  return preset.sections
    .map((s) => ({
      id: s.id,
      label: s.title,
      items: s.fields
        .filter((f) => f.type !== "note")
        .map((f) => ({ key: f.key, label: f.label, field: effectiveField(f, s.visibleIf) })),
    }))
    .filter((c) => c.items.length > 0);
}

// ------------------------------------------------------------
// Construcción de los campos a insertar
// ------------------------------------------------------------
/**
 * Dado un pack, las keys seleccionadas y las keys ya presentes en el
 * formulario, devuelve los campos a insertar (con `id` nuevo y visibleIf
 * efectivo), agregando automáticamente las preguntas base de las que dependan
 * (cierre transitivo) y omitiendo las que ya existan en el formulario.
 */
export function buildInsertFields(
  preset: FieldPreset,
  selectedKeys: string[],
  existingKeys: string[],
): { fields: Field[]; autoAdded: string[]; skipped: string[] } {
  // Mapa key -> Field efectivo, en orden del pack.
  const effByKey = new Map<string, Field>();
  const order: string[] = [];
  for (const s of preset.sections) {
    for (const f of s.fields) {
      if (f.type === "note") continue;
      if (!effByKey.has(f.key)) {
        effByKey.set(f.key, effectiveField(f, s.visibleIf));
        order.push(f.key);
      }
    }
  }

  const existing = new Set(existingKeys);
  const wanted = new Set<string>();
  const selectedSet = new Set<string>();
  const autoAdded: string[] = [];
  const queue: string[] = [];

  // Semilla: solo keys que existan en el pack.
  for (const k of selectedKeys) {
    if (effByKey.has(k) && !wanted.has(k)) {
      wanted.add(k);
      selectedSet.add(k);
      queue.push(k);
    }
  }

  // Cierre de dependencias.
  while (queue.length) {
    const k = queue.shift() as string;
    const eff = effByKey.get(k) as Field;
    for (const ref of conditionRefs(eff.visibleIf)) {
      if (!effByKey.has(ref)) continue; // no está en el pack → ignora
      if (existing.has(ref)) continue; // ya está en el form → no re-agrega
      if (wanted.has(ref)) continue;
      wanted.add(ref);
      queue.push(ref);
      if (!selectedSet.has(ref)) autoAdded.push(ref);
    }
  }

  // Materializa en orden del pack, omitiendo duplicados ya presentes.
  const skipped: string[] = [];
  const fields: Field[] = [];
  for (const k of order) {
    if (!wanted.has(k)) continue;
    if (existing.has(k)) {
      skipped.push(k);
      continue;
    }
    const clone = structuredClone(effByKey.get(k) as Field);
    clone.id = uid();
    fields.push(clone);
  }

  return { fields, autoAdded, skipped };
}

// ============================================================
// Recorrido de traducibles sobre un FormDefinition — client-safe y puro
// ------------------------------------------------------------
// Un solo recorrido (`walkSlots`) produce accessors read/write por cada texto
// traducible. Todo lo demás (extraer, aplicar, cobertura, procedencia) se monta
// encima, así extraer y aplicar nunca se pueden desincronizar.
//
// Los `path` se derivan de ids que YA son estables en la definición
// (`section.id` y `field.id` son uuid; `option.value` es el identificador que
// guardan las respuestas). Por eso reordenar secciones o campos entre la
// extracción y la aplicación no corrompe nada — a diferencia de indexar por
// posición, y a diferencia de indexar por texto origen como hacía el script
// viejo (scripts/translate-form.mjs), que colisiona con duplicados de
// significado distinto ("Nombre" de persona vs de empresa).
// ============================================================
import {
  getLoc,
  setLoc,
  resolveText,
  type FormDefinition,
  type I18nProvenance,
  type LocalizedText,
} from "@/lib/forms/definition";
import type { TranslateItem, TranslateResult } from "./provider";

/** Accessor a un texto traducible dentro de la definición. */
export interface SlotRef {
  path: string;
  /** Contexto legible para desambiguar la traducción. */
  hint: string;
  read: () => LocalizedText | undefined;
  write: (v: Record<string, string>) => void;
}

// ------------------------------------------------------------
// Paths
// ------------------------------------------------------------
// Los ids son uuid (sin `|`), así que el prefijo fija la aridad y todo lo que
// sigue al último separador esperado es el valor de la opción: no hay
// ambigüedad aunque un `option.value` contenga `|`. Nunca se parsean de vuelta;
// solo se comparan por igualdad.
export const PATH_TITLE = "title";
const pSection = (sid: string, part: "title" | "desc") => `s|${sid}|${part}`;
const pField = (sid: string, fid: string, part: "label" | "help" | "ph") =>
  `f|${sid}|${fid}|${part}`;
const pOption = (sid: string, fid: string, value: string) => `o|${sid}|${fid}|${value}`;

/**
 * Todos los textos traducibles de la definición, con accessors.
 * Muta `def` a través de `write` — pensado para usarse dentro del mutador
 * `update()` del builder, que ya trabaja sobre un `structuredClone`.
 */
export function walkSlots(def: FormDefinition): SlotRef[] {
  const out: SlotRef[] = [];
  const src = def.defaultLocale || "es";

  out.push({
    path: PATH_TITLE,
    hint: "título del formulario",
    read: () => def.title,
    write: (v) => {
      def.title = v;
    },
  });

  for (const section of def.sections) {
    const sid = section.id;
    const sectionName = resolveText(section.title, src) || "(sección sin título)";

    out.push({
      path: pSection(sid, "title"),
      hint: "título de sección",
      read: () => section.title,
      write: (v) => {
        section.title = v;
      },
    });
    out.push({
      path: pSection(sid, "desc"),
      hint: `descripción de la sección «${sectionName}»`,
      read: () => section.description,
      write: (v) => {
        section.description = v;
      },
    });

    for (const field of section.fields) {
      const fid = field.id;
      const fieldName = resolveText(field.label, src) || field.key;
      const where = `sección «${sectionName}»`;

      out.push({
        path: pField(sid, fid, "label"),
        hint:
          field.type === "note"
            ? `encabezado/nota informativa en ${where}`
            : `etiqueta de pregunta (tipo ${field.type}) en ${where}`,
        read: () => field.label,
        write: (v) => {
          field.label = v;
        },
      });
      out.push({
        path: pField(sid, fid, "help"),
        hint: `texto de ayuda de la pregunta «${fieldName}»`,
        read: () => field.help,
        write: (v) => {
          field.help = v;
        },
      });
      out.push({
        path: pField(sid, fid, "ph"),
        hint: `placeholder/ejemplo del campo «${fieldName}» (tipo ${field.type})`,
        read: () => field.placeholder,
        write: (v) => {
          field.placeholder = v;
        },
      });

      for (const option of field.options ?? []) {
        out.push({
          path: pOption(sid, fid, option.value),
          hint: `opción de respuesta de la pregunta «${fieldName}»`,
          read: () => option.label,
          write: (v) => {
            option.label = v;
          },
        });
      }
    }
  }

  return out;
}

/**
 * Scope de los textos que NO pertenecen a ninguna sección (hoy solo el título
 * del formulario). Existe para que el builder pueda recorrer
 * `[FORM_SCOPE, ...sectionIds]` y cubrir el 100% sin pedir todo de una vez.
 */
export const FORM_SCOPE = "__form__";

const SECTION_PREFIXES = ["s|", "f|", "o|"];

/** Slots de una sección concreta, del scope de formulario, o todos. */
function slotsFor(def: FormDefinition, sectionId?: string): SlotRef[] {
  const all = walkSlots(def);
  if (!sectionId) return all;
  if (sectionId === FORM_SCOPE) {
    return all.filter((s) => !SECTION_PREFIXES.some((p) => s.path.startsWith(p)));
  }
  const prefixes = [`s|${sectionId}|`, `f|${sectionId}|`, `o|${sectionId}|`];
  return all.filter((s) => prefixes.some((p) => s.path.startsWith(p)));
}

// ------------------------------------------------------------
// Extracción
// ------------------------------------------------------------
export interface CollectOptions {
  /** Locale destino. */
  to: string;
  /** Solo esta sección (para traducir de a poco). */
  sectionId?: string;
  /** `true` (default): omite lo que ya tiene texto en el destino. */
  onlyMissing?: boolean;
}

/**
 * Items a mandar al proveedor. Omite textos origen vacíos, y con
 * `onlyMissing` omite lo ya traducido (nunca pisa trabajo humano por defecto).
 */
export function collectTranslatable(
  def: FormDefinition,
  { to, sectionId, onlyMissing = true }: CollectOptions,
): TranslateItem[] {
  const src = def.defaultLocale || "es";
  const items: TranslateItem[] = [];
  for (const slot of slotsFor(def, sectionId)) {
    const v = slot.read();
    const source = getLoc(v, src, src);
    if (!source.trim()) continue;
    if (onlyMissing && getLoc(v, to, src).trim()) continue;
    items.push({ id: slot.path, text: source, hint: slot.hint });
  }
  return items;
}

// ------------------------------------------------------------
// Aplicación
// ------------------------------------------------------------
export interface ApplyOptions {
  to: string;
  /** Modelo que produjo la traducción, para registrar procedencia. */
  model?: string;
  /** Timestamp ISO. Inyectable para que la función quede determinista. */
  at?: string;
}

export interface ApplyReport {
  applied: number;
  keptSource: number;
  unknown: number;
}

/**
 * Escribe los resultados en el locale destino y registra procedencia `ai`.
 * MUTA `def` (usar dentro de `update()` del builder).
 *
 * `keepSource` escribe el texto ORIGEN en el destino: así un nombre propio
 * cuenta como resuelto y no se re-manda al modelo en cada pase.
 */
export function applyTranslations(
  def: FormDefinition,
  results: TranslateResult[],
  { to, model, at }: ApplyOptions,
): ApplyReport {
  const src = def.defaultLocale || "es";
  const byPath = new Map(slotsFor(def).map((s) => [s.path, s]));
  const report: ApplyReport = { applied: 0, keptSource: 0, unknown: 0 };

  for (const r of results) {
    const slot = byPath.get(r.id);
    if (!slot) {
      report.unknown++;
      continue;
    }
    const current = slot.read();
    const source = getLoc(current, src, src);
    const next = r.keepSource ? source : r.text;
    if (!next.trim()) continue;

    slot.write(setLoc(current, to, next, src));
    setProvenance(def, slot.path, to, { source: "ai", model, at });
    report.applied++;
    if (r.keepSource) report.keptSource++;
  }
  return report;
}

// ------------------------------------------------------------
// Procedencia
// ------------------------------------------------------------
function setProvenance(
  def: FormDefinition,
  path: string,
  locale: string,
  p: I18nProvenance,
): void {
  const meta = (def.meta ??= {});
  const i18n = (meta.i18n ??= {});
  const byLocale = (i18n[path] ??= {});
  byLocale[locale] = p;
}

export function provenanceOf(
  def: FormDefinition,
  path: string,
  locale: string,
): I18nProvenance | undefined {
  return def.meta?.i18n?.[path]?.[locale];
}

/** ¿Este texto lo puso la IA y nadie lo revisó todavía? */
export function isMachineTranslated(
  def: FormDefinition,
  path: string,
  locale: string,
): boolean {
  return provenanceOf(def, path, locale)?.source === "ai";
}

/**
 * Marca un texto como escrito por una persona: borra el rastro de IA para que
 * el badge `[auto]` desaparezca y un re-pase "solo faltantes" no lo toque.
 * MUTA `def`. Se llama junto al `setLoc` de cada edición manual del builder.
 */
export function markHuman(def: FormDefinition, path: string, locale: string): void {
  const byLocale = def.meta?.i18n?.[path];
  if (!byLocale?.[locale]) return;
  delete byLocale[locale];
  if (Object.keys(byLocale).length === 0) delete def.meta!.i18n![path];
}

/**
 * Mueve la procedencia de un path a otro. Necesario cuando cambia un
 * `option.value`, que forma parte del path: sin esto la marca queda huérfana y
 * el badge desaparecería sin que nadie revisara el texto. MUTA `def`.
 */
export function renameProvenance(
  def: FormDefinition,
  fromPath: string,
  toPath: string,
): void {
  if (fromPath === toPath) return;
  const i18n = def.meta?.i18n;
  const entry = i18n?.[fromPath];
  if (!i18n || !entry) return;
  i18n[toPath] = entry;
  delete i18n[fromPath];
}

// ------------------------------------------------------------
// Cobertura
// ------------------------------------------------------------
export interface Coverage {
  total: number;
  translated: number;
  missing: number;
  /** Traducidos que siguen marcados como IA sin revisar. */
  machine: number;
  percent: number;
}

/**
 * Cuánto del formulario existe en `locale`. Necesario porque `resolveText` cae
 * al locale por defecto en silencio: sin esta medición, un formulario a medio
 * traducir se ve completo y sale a producción con español filtrado.
 */
export function coverage(def: FormDefinition, locale: string): Coverage {
  const src = def.defaultLocale || "es";
  let total = 0;
  let translated = 0;
  let machine = 0;

  for (const slot of walkSlots(def)) {
    const v = slot.read();
    if (!getLoc(v, src, src).trim()) continue;
    total++;
    if (getLoc(v, locale, src).trim()) {
      translated++;
      if (isMachineTranslated(def, slot.path, locale)) machine++;
    }
  }

  return {
    total,
    translated,
    missing: total - translated,
    machine,
    percent: total === 0 ? 100 : Math.round((translated / total) * 100),
  };
}

/** Paths de los slots de una sección, para pintar badges en el builder. */
export { slotsFor as sectionSlots };
export { pSection as sectionPath, pField as fieldPath, pOption as optionPath };

import { z } from "zod";

// ============================================================
// Texto localizado (client-safe; no depende de server-only)
// ============================================================
export const localizedTextSchema = z.union([
  z.string(),
  z.record(z.string(), z.string()),
]);
export type LocalizedText = z.infer<typeof localizedTextSchema>;

export function resolveText(
  v: LocalizedText | null | undefined,
  locale = "es",
  fallbacks: string[] = ["es", "en"],
): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v[locale]) return v[locale];
  for (const f of fallbacks) if (v[f]) return v[f];
  const first = Object.values(v)[0];
  return typeof first === "string" ? first : "";
}

// ============================================================
// Tipos de campo
// ============================================================
export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "number",
  "date",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "file",
  "selfie",
  "boolean",
  "note",
] as const;
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = (typeof FIELD_TYPES)[number];

export function isChoiceType(t: FieldType): boolean {
  return t === "single_choice" || t === "multiple_choice" || t === "dropdown";
}

// ============================================================
// Revisión con DIDIT (metadata por-campo)
// ============================================================
export const DIDIT_FEATURES = [
  "aml_screening",
  "id_verification",
  "proof_of_address",
  "email_verification",
  "phone_verification",
  "database_validation",
  "age_estimation",
  "liveness",
  "face_match",
] as const;
export const diditFeatureSchema = z.enum(DIDIT_FEATURES);
export type DiditFeature = (typeof DIDIT_FEATURES)[number];

/** Tipos de campo compatibles con cada feature de DIDIT (subconjunto mapeable). */
export const DIDIT_FEATURE_COMPAT: Record<DiditFeature, FieldType[]> = {
  aml_screening: ["short_text", "long_text"],
  id_verification: ["file"],
  proof_of_address: ["file"],
  email_verification: ["email"],
  phone_verification: ["short_text"],
  database_validation: ["short_text"],
  age_estimation: ["selfie", "file"],
  liveness: ["selfie"],
  face_match: ["selfie"],
};

/** ¿El tipo de campo satisface el input que requiere la feature de DIDIT? */
export function isDiditCompatible(feature: DiditFeature, type: FieldType): boolean {
  return DIDIT_FEATURE_COMPAT[feature].includes(type);
}

export const reviewSchema = z.object({
  provider: z.literal("didit"),
  feature: diditFeatureSchema,
});
export type FieldReview = z.infer<typeof reviewSchema>;

// ============================================================
// Condiciones (lógica)
// ============================================================
export const CONDITION_OPS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "answered",
  "gt",
  "lt",
] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition =
  | { field: string; op: ConditionOp; value?: unknown }
  | { all: Condition[] }
  | { any: Condition[] };

const conditionLeaf = z.object({
  field: z.string().min(1),
  op: z.enum(CONDITION_OPS),
  value: z.unknown().optional(),
});

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    conditionLeaf,
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
  ]),
);

// ============================================================
// Campo, sección, formulario
// ============================================================
export const optionSchema = z.object({
  value: z.string(),
  label: localizedTextSchema,
  image: z.string().optional(), // URL pública de imagen de ayuda (opcional)
});
export type FormOption = z.infer<typeof optionSchema>;

export const fileConfigSchema = z.object({
  accept: z.array(z.string()).default([]),
  multiple: z.boolean().default(false),
  maxSizeMB: z.number().positive().default(15),
});

export const validationSchema = z
  .object({
    minLen: z.number().int().nonnegative().optional(),
    maxLen: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  })
  .optional();

export const fieldSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  type: fieldTypeSchema,
  label: localizedTextSchema,
  help: localizedTextSchema.optional(),
  image: z.string().optional(), // URL pública de imagen de ayuda (opcional)
  placeholder: localizedTextSchema.optional(),
  required: z.boolean().default(false),
  options: z.array(optionSchema).optional(),
  file: fileConfigSchema.optional(),
  validation: validationSchema,
  visibleIf: conditionSchema.optional(),
  review: reviewSchema.optional(),
});
export type Field = z.infer<typeof fieldSchema>;

export const SUBMIT = "SUBMIT" as const;

export const navRuleSchema = z.object({
  when: conditionSchema,
  goTo: z.string().min(1), // id de sección o "SUBMIT"
});
export type NavRule = z.infer<typeof navRuleSchema>;

export const sectionSchema = z.object({
  id: z.string().min(1),
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  visibleIf: conditionSchema.optional(),
  fields: z.array(fieldSchema),
  next: z.array(navRuleSchema).optional(),
  defaultGoTo: z.string().optional(), // sección | "SUBMIT" si no matchea ninguna regla `next`
});
export type Section = z.infer<typeof sectionSchema>;

export const formDefinitionSchema = z.object({
  version: z.literal(1).default(1),
  title: localizedTextSchema,
  locales: z.array(z.string()).min(1).default(["es", "en"]),
  defaultLocale: z.string().default("es"),
  sections: z.array(sectionSchema),
});
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

// ============================================================
// Helpers de construcción
// ============================================================
export function uid(): string {
  return globalThis.crypto.randomUUID();
}

export function newField(type: FieldType): Field {
  const base: Field = {
    id: uid(),
    key: `f_${uid().slice(0, 8)}`,
    type,
    label: { es: "", en: "" },
    required: false,
  };
  if (isChoiceType(type)) {
    base.options = [{ value: "opcion_1", label: { es: "Opción 1", en: "Option 1" } }];
  }
  if (type === "file") {
    base.file = { accept: [], multiple: false, maxSizeMB: 15 };
  }
  return base;
}

export function newSection(): Section {
  return { id: uid(), title: { es: "", en: "" }, fields: [] };
}

export function emptyForm(): FormDefinition {
  return {
    version: 1,
    title: { es: "Nuevo formulario", en: "New form" },
    locales: ["es", "en"],
    defaultLocale: "es",
    sections: [newSection()],
  };
}

export function countFields(def: FormDefinition): number {
  return def.sections.reduce((n, s) => n + s.fields.length, 0);
}

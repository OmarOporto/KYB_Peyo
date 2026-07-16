// ============================================================
// Pack prearmado: DIDIT — Verificación KYC
// ------------------------------------------------------------
// Campos para las verificaciones de DIDIT enfocadas a KYC/facial:
// verificación de documento, coincidencia facial (selfie vs
// documento) y AML screening. Cada campo va pre-etiquetado con su
// `field.review = { provider: "didit", feature }` para que el
// dispatch futuro sepa qué mandar a cada endpoint de DIDIT.
//
// Los `id` son placeholders; `buildInsertFields()` los regenera al
// insertar (conservando `key` y `review`).
// ============================================================
import type { Field, FieldReview, FormOption, Section } from "@/lib/forms/definition";
import type { FieldPreset } from "./index";

type L = { es: string; en: string };

type FieldInput = {
  key: string;
  type: Field["type"];
  label: L;
  required?: boolean;
  help?: L;
  placeholder?: L;
  options?: FormOption[];
  file?: Field["file"];
  review?: FieldReview;
};

function field(input: FieldInput): Field {
  const f: Field = {
    id: input.key, // placeholder; regenerado por buildInsertFields()
    key: input.key,
    type: input.type,
    label: input.label,
    required: input.required ?? false,
  };
  if (input.help) f.help = input.help;
  if (input.placeholder) f.placeholder = input.placeholder;
  if (input.options) f.options = input.options;
  if (input.file) f.file = input.file;
  if (input.review) f.review = input.review;
  return f;
}

function opt(value: string, es: string, en: string): FormOption {
  return { value, label: { es, en } };
}

function section(id: string, title: L, fields: Field[], description?: L): Section {
  const s: Section = { id, title, fields };
  if (description) s.description = description;
  return s;
}

/** Atajo para etiquetar un campo con una revisión de DIDIT. */
const didit = (feature: FieldReview["feature"]): FieldReview => ({ provider: "didit", feature });

const DOC_FILE = { accept: ["image/*", "application/pdf"], multiple: false, maxSizeMB: 15 };

/** Documento de identidad — frente (aporta el retrato de referencia para face match). */
function docFront(): Field {
  return field({
    key: "didit_id_front",
    type: "file",
    label: { es: "Documento — frente", en: "Document — front" },
    required: true,
    file: DOC_FILE,
    review: didit("id_verification"),
    help: {
      es: "Foto del frente de tu identificación (INE / pasaporte / licencia).",
      en: "Photo of the front of your ID (national ID / passport / license).",
    },
  });
}

/** Documento de identidad — reverso. */
function docBack(): Field {
  return field({
    key: "didit_id_back",
    type: "file",
    label: { es: "Documento — reverso", en: "Document — back" },
    file: DOC_FILE,
    review: didit("id_verification"),
    help: { es: "Reverso, si tu documento lo tiene.", en: "Back side, if your document has one." },
  });
}

const sections: Section[] = [
  // 1. Documento de identidad → id_verification
  section(
    "didit_kyc_document",
    { es: "Documento de identidad", en: "Identity document" },
    [docFront(), docBack()],
    {
      es: "Sube tu documento de identidad; DIDIT lo verifica y extrae la cara de referencia.",
      en: "Upload your ID document; DIDIT verifies it and extracts the reference face.",
    },
  ),

  // 2. Coincidencia facial → face_match (selfie en vivo)
  section(
    "didit_kyc_face",
    { es: "Coincidencia facial", en: "Face match" },
    [
      docFront(),
      field({
        key: "didit_selfie",
        type: "selfie",
        label: { es: "Selfie en vivo", en: "Live selfie" },
        required: true,
        review: { ...didit("face_match"), refKeys: ["didit_id_front", "didit_id_back"] },
        help: {
          es: "Se compara con el retrato del documento de identidad de esta sección. La misma captura sirve para liveness.",
          en: "Compared against the ID document portrait in this section. The same capture serves for liveness.",
        },
      }),
    ],
    {
      es: "Compara una selfie en vivo con la cara del documento (incluye prueba de vida).",
      en: "Compares a live selfie against the document face (includes liveness).",
    },
  ),

  // 3. AML screening → aml_screening (solo texto)
  section(
    "didit_kyc_aml",
    { es: "AML (screening)", en: "AML (screening)" },
    [
      field({
        key: "didit_full_name",
        type: "short_text",
        label: { es: "Nombre legal completo", en: "Full legal name" },
        required: true,
        review: didit("aml_screening"),
      }),
      field({ key: "didit_birth_date", type: "date", label: { es: "Fecha de nacimiento", en: "Date of birth" } }),
      field({
        key: "didit_nationality",
        type: "short_text",
        label: { es: "Nacionalidad", en: "Nationality" },
        help: { es: "ISO 3166-1 alpha-2 (ej. MX).", en: "ISO 3166-1 alpha-2 (e.g. MX)." },
        placeholder: { es: "MX", en: "MX" },
      }),
      field({ key: "didit_document_number", type: "short_text", label: { es: "Número de documento", en: "Document number" } }),
      field({
        key: "didit_entity_type",
        type: "dropdown",
        label: { es: "Tipo de entidad", en: "Entity type" },
        options: [opt("person", "Persona", "Person"), opt("company", "Empresa", "Company")],
      }),
    ],
    {
      es: "Screening contra listas de sanciones/PEP/medios adversos (solo datos de texto).",
      en: "Screening against sanctions/PEP/adverse-media lists (text data only).",
    },
  ),
];

export const diditKycPreset: FieldPreset = {
  id: "didit_kyc",
  label: { es: "DIDIT — Verificación KYC", en: "DIDIT — KYC verification" },
  description: {
    es: "Campos para verificación de identidad, coincidencia facial y AML con DIDIT.",
    en: "Fields for ID verification, face match and AML with DIDIT.",
  },
  sections,
};

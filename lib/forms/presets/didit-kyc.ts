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

  // 4. Comprobante de domicilio → proof_of_address
  section(
    "didit_kyc_poa",
    { es: "Comprobante de domicilio", en: "Proof of address" },
    [
      field({
        key: "didit_poa_document",
        type: "file",
        label: { es: "Comprobante de domicilio", en: "Proof of address" },
        required: true,
        file: DOC_FILE,
        review: didit("proof_of_address"),
        help: {
          es: "Recibo de servicios o estado de cuenta reciente con tu domicilio.",
          en: "Recent utility bill or bank statement showing your address.",
        },
      }),
    ],
    {
      es: "Sube un comprobante de domicilio; DIDIT lo valida.",
      en: "Upload a proof of address; DIDIT validates it.",
    },
  ),

  // 5. Estimación de edad → age_estimation (selfie propia)
  section(
    "didit_kyc_age",
    { es: "Estimación de edad", en: "Age estimation" },
    [
      field({
        key: "didit_age_selfie",
        type: "selfie",
        label: { es: "Selfie para estimación de edad", en: "Selfie for age estimation" },
        required: true,
        review: didit("age_estimation"),
        help: {
          es: "Se usa para estimar tu edad aproximada.",
          en: "Used to estimate your approximate age.",
        },
      }),
    ],
    {
      es: "Estima la edad a partir de una selfie en vivo.",
      en: "Estimates age from a live selfie.",
    },
  ),

  // 6. Validación en base de datos → database_validation (datos de texto).
  // El campo de nombre lleva el tag; los hermanos se leen por convención de key
  // (first_name / last_name / birth_date / personal_number / issuing_state).
  section(
    "didit_kyc_db",
    { es: "Validación en base de datos", en: "Database validation" },
    [
      field({
        key: "didit_db_first_name",
        type: "short_text",
        label: { es: "Nombre(s)", en: "First name" },
        required: true,
        review: didit("database_validation"),
      }),
      field({
        key: "didit_db_last_name",
        type: "short_text",
        label: { es: "Apellido(s)", en: "Last name" },
        required: true,
      }),
      field({
        key: "didit_db_birth_date",
        type: "date",
        label: { es: "Fecha de nacimiento", en: "Date of birth" },
      }),
      field({
        key: "didit_db_personal_number",
        type: "short_text",
        label: { es: "Número personal (CURP / ID)", en: "Personal number (ID)" },
      }),
      field({
        key: "didit_db_issuing_state",
        type: "short_text",
        label: { es: "Estado emisor", en: "Issuing state" },
        help: { es: "ISO 3166-1 alpha-2 (ej. MX).", en: "ISO 3166-1 alpha-2 (e.g. MX)." },
      }),
    ],
    {
      es: "Valida los datos personales contra bases de datos oficiales (solo texto).",
      en: "Validates personal data against official databases (text only).",
    },
  ),
];

export const diditKycPreset: FieldPreset = {
  id: "didit_kyc",
  label: { es: "DIDIT — Verificación KYC", en: "DIDIT — KYC verification" },
  description: {
    es: "Campos para todas las verificaciones DIDIT: identidad, coincidencia facial, liveness, AML, comprobante de domicilio, estimación de edad y validación en base de datos.",
    en: "Fields for all DIDIT checks: ID, face match, liveness, AML, proof of address, age estimation and database validation.",
  },
  sections,
};

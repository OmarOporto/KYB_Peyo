// ============================================================
// Pack prearmado: DIDIT — Validación de empresa (KYB)
// ------------------------------------------------------------
// Campos para validar una empresa con DIDIT:
// - Registro mercantil (kyb_registry): razón social taggeada con
//   binding EXPLÍCITO a las preguntas de país y nº de registro del
//   propio pack — insertado desde aquí es imposible configurarlo mal.
//   El ciclo lo dispara el analista desde el panel (search gratis,
//   select facturable).
// - AML de la entidad (aml_screening con entity_type=company):
//   corre automático al enviar el formulario.
//
// Las keys `business_legal_name` / `registration_number` coinciden a
// propósito con las del pack Bridge KYB: si el formulario ya las
// tiene, buildInsertFields() las omite (dedup) y el binding sigue
// resolviendo contra las existentes.
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

const sections: Section[] = [
  // 1. Registro mercantil → kyb_registry (ciclo manual del analista)
  section(
    "didit_kyb_registry",
    { es: "Registro mercantil", en: "Company registry" },
    [
      field({
        key: "business_legal_name",
        type: "short_text",
        label: { es: "Razón social (nombre legal)", en: "Legal business name" },
        required: true,
        review: {
          provider: "didit",
          feature: "kyb_registry",
          kybCountryKey: "incorporation_country",
          kybRegNumberKey: "registration_number",
        },
        help: {
          es: "Nombre legal exacto como figura en el registro de sociedades (no el nombre comercial).",
          en: "Exact legal name as it appears in the companies registry (not the trade name).",
        },
      }),
      field({
        key: "incorporation_country",
        type: "country",
        label: { es: "País de constitución", en: "Country of incorporation" },
        required: true,
        help: {
          es: "País donde la empresa está registrada. Obligatorio para la búsqueda registral.",
          en: "Country where the company is registered. Required for the registry search.",
        },
      }),
      field({
        key: "registration_number",
        type: "short_text",
        label: { es: "Número de registro mercantil", en: "Company registration number" },
        help: {
          es: "Matrícula / número en el registro de sociedades. Con él la validación puede confirmarse automáticamente; sin él siempre pasa por revisión del analista.",
          en: "Number in the companies registry. With it the validation can auto-confirm; without it, it always goes through analyst review.",
        },
      }),
    ],
    {
      es: "Valida la empresa contra el registro mercantil oficial (perfil, estado, directores y beneficiarios finales). La ejecuta el analista desde el panel.",
      en: "Validates the company against the official registry (profile, status, officers and beneficial owners). Run by the analyst from the panel.",
    },
  ),

  // 2. AML de la empresa → aml_screening (entity_type=company; corre al enviar)
  section(
    "didit_kyb_aml",
    { es: "AML de la empresa", en: "Company AML" },
    [
      field({
        key: "didit_company_aml_name",
        type: "short_text",
        label: { es: "Razón social (screening AML)", en: "Legal name (AML screening)" },
        required: true,
        review: { provider: "didit", feature: "aml_screening" },
        help: {
          es: "Normalmente la misma razón social; se screenea contra sanciones/watchlists.",
          en: "Usually the same legal name; screened against sanctions/watchlists.",
        },
      }),
      field({
        key: "didit_company_entity_type",
        type: "dropdown",
        label: { es: "Tipo de entidad", en: "Entity type" },
        options: [opt("company", "Empresa", "Company"), opt("person", "Persona", "Person")],
        help: {
          es: "Para screening de empresa elige Empresa.",
          en: "For company screening choose Company.",
        },
      }),
    ],
    {
      es: "Screening de la entidad contra listas de sanciones/PEP/medios adversos (corre automático al enviar).",
      en: "Entity screening against sanctions/PEP/adverse-media lists (runs automatically on submit).",
    },
  ),
];

export const diditKybPreset: FieldPreset = {
  id: "didit_kyb",
  label: { es: "DIDIT — Validación de empresa (KYB)", en: "DIDIT — Business validation (KYB)" },
  description: {
    es: "Campos para validar una empresa con DIDIT: registro mercantil (perfil oficial, directores, UBOs) y screening AML de la entidad.",
    en: "Fields to validate a company with DIDIT: company registry (official profile, officers, UBOs) and entity AML screening.",
  },
  sections,
};

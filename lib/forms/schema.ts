import { z } from "zod";

export const FORM_VERSION = "v1";

const beneficialOwner = z.object({
  fullName: z.string().min(1, "Requerido"),
  documentId: z.string().min(1, "Requerido"),
  ownershipPct: z.coerce
    .number()
    .min(0, "Mínimo 0")
    .max(100, "Máximo 100"),
});

/** Esquema completo — se valida al ENVIAR. */
export const kybSubmitSchema = z.object({
  // Paso 1: Empresa
  legalName: z.string().min(1, "Requerido"),
  tradeName: z.string().optional(),
  registrationNumber: z.string().min(1, "Requerido"),
  taxId: z.string().min(1, "Requerido"),
  incorporationDate: z.string().min(1, "Requerido"),
  legalForm: z.string().min(1, "Requerido"),
  country: z.string().min(1, "Requerido"),

  // Paso 2: Dirección
  addressLine: z.string().min(1, "Requerido"),
  city: z.string().min(1, "Requerido"),
  state: z.string().optional(),
  postalCode: z.string().optional(),

  // Paso 3: Representante legal
  repFirstName: z.string().min(1, "Requerido"),
  repLastName: z.string().min(1, "Requerido"),
  repEmail: z.string().email("Email inválido"),
  repPhone: z.string().min(1, "Requerido"),
  repDocumentId: z.string().min(1, "Requerido"),

  // Paso 4: Beneficiarios finales
  beneficialOwners: z.array(beneficialOwner).min(1, "Agrega al menos uno"),

  // Paso 5: Confirmación
  acceptTerms: z
    .boolean()
    .refine((v) => v === true, { message: "Debes aceptar para continuar" }),
});

export type KybFormValues = z.infer<typeof kybSubmitSchema>;

/** Esquema de borrador — todo opcional, para autosave incremental. */
export const kybDraftSchema = kybSubmitSchema.partial().extend({
  beneficialOwners: z.array(beneficialOwner.partial()).optional(),
  acceptTerms: z.boolean().optional(),
});

export type KybDraftValues = z.infer<typeof kybDraftSchema>;

/** Metadatos de pasos para render + validación por paso en el cliente. */
export const FORM_STEPS = [
  {
    id: "empresa",
    title: "Datos de la empresa",
    fields: [
      "legalName",
      "tradeName",
      "registrationNumber",
      "taxId",
      "incorporationDate",
      "legalForm",
      "country",
    ],
  },
  {
    id: "direccion",
    title: "Dirección",
    fields: ["addressLine", "city", "state", "postalCode"],
  },
  {
    id: "representante",
    title: "Representante legal",
    fields: [
      "repFirstName",
      "repLastName",
      "repEmail",
      "repPhone",
      "repDocumentId",
    ],
  },
  {
    id: "beneficiarios",
    title: "Beneficiarios finales",
    fields: ["beneficialOwners"],
  },
  {
    id: "documentos",
    title: "Documentos y confirmación",
    fields: ["acceptTerms"],
  },
] as const;

export const emptyForm: KybDraftValues = {
  legalName: "",
  tradeName: "",
  registrationNumber: "",
  taxId: "",
  incorporationDate: "",
  legalForm: "",
  country: "",
  addressLine: "",
  city: "",
  state: "",
  postalCode: "",
  repFirstName: "",
  repLastName: "",
  repEmail: "",
  repPhone: "",
  repDocumentId: "",
  beneficialOwners: [{ fullName: "", documentId: "", ownershipPct: 0 }],
  acceptTerms: false,
};

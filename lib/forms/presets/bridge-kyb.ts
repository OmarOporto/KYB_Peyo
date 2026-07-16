// ============================================================
// Pack prearmado: Bridge KYB
// ------------------------------------------------------------
// Campos que Bridge (bridge.xyz) requiere para dar de alta un
// negocio (`POST /v0/customers`, type: "business") y correr KYB.
//
// Convención de `key`: refleja los nombres de la API de Bridge, con
// notación `objeto.campo` para objetos anidados (direcciones,
// identifying_information) e índice para arreglos
// (`associated_persons.{i}.campo`). Esto permite reconstruir el
// payload anidado de Bridge en un paso posterior (mapeo pendiente).
//
// Los `id` son placeholders legibles; `instantiatePreset()` los
// regenera con uid() al insertar el pack para evitar colisiones.
// ============================================================
import type {
  Condition,
  Field,
  FormOption,
  Section,
} from "@/lib/forms/definition";
import type { FieldPreset } from "./index";

type L = { es: string; en: string };

// ---------- helpers de construcción ----------
type FieldInput = {
  key: string;
  type: Field["type"];
  label: L;
  required?: boolean;
  help?: L;
  placeholder?: L;
  options?: FormOption[];
  visibleIf?: Condition;
  file?: Field["file"];
  validation?: Field["validation"];
};

function field(input: FieldInput): Field {
  const f: Field = {
    id: input.key, // placeholder; regenerado por instantiatePreset()
    key: input.key,
    type: input.type,
    label: input.label,
    required: input.required ?? false,
  };
  if (input.help) f.help = input.help;
  if (input.placeholder) f.placeholder = input.placeholder;
  if (input.options) f.options = input.options;
  if (input.visibleIf) f.visibleIf = input.visibleIf;
  if (input.file) f.file = input.file;
  if (input.validation) f.validation = input.validation;
  return f;
}

function opt(value: string, es: string, en: string): FormOption {
  return { value, label: { es, en } };
}

function section(
  id: string,
  title: L,
  fields: Field[],
  extra?: { description?: L; visibleIf?: Condition },
): Section {
  const s: Section = { id, title, fields };
  if (extra?.description) s.description = extra.description;
  if (extra?.visibleIf) s.visibleIf = extra.visibleIf;
  return s;
}

// ---------- catálogos reutilizables ----------
const DOC_FILE = { accept: ["application/pdf", "image/*"], multiple: false, maxSizeMB: 15 };

// Lista curada de países (ISO 3166-1 alpha-3). El admin puede
// agregar/quitar opciones en el builder.
const COUNTRY_OPTIONS: FormOption[] = [
  opt("USA", "Estados Unidos", "United States"),
  opt("MEX", "México", "Mexico"),
  opt("CAN", "Canadá", "Canada"),
  opt("GTM", "Guatemala", "Guatemala"),
  opt("SLV", "El Salvador", "El Salvador"),
  opt("HND", "Honduras", "Honduras"),
  opt("NIC", "Nicaragua", "Nicaragua"),
  opt("CRI", "Costa Rica", "Costa Rica"),
  opt("PAN", "Panamá", "Panama"),
  opt("DOM", "República Dominicana", "Dominican Republic"),
  opt("COL", "Colombia", "Colombia"),
  opt("PER", "Perú", "Peru"),
  opt("ECU", "Ecuador", "Ecuador"),
  opt("CHL", "Chile", "Chile"),
  opt("ARG", "Argentina", "Argentina"),
  opt("BRA", "Brasil", "Brazil"),
  opt("URY", "Uruguay", "Uruguay"),
  opt("ESP", "España", "Spain"),
  opt("GBR", "Reino Unido", "United Kingdom"),
];

const BUSINESS_TYPE_OPTIONS: FormOption[] = [
  opt("cooperative", "Cooperativa", "Cooperative"),
  opt("corporation", "Sociedad anónima (corporation)", "Corporation"),
  opt("llc", "Responsabilidad limitada (LLC)", "LLC"),
  opt("partnership", "Sociedad (partnership)", "Partnership"),
  opt("sole_prop", "Persona física con actividad empresarial", "Sole proprietorship"),
  opt("trust", "Fideicomiso", "Trust"),
  opt("other", "Otro", "Other"),
];

const BUSINESS_TAX_TYPE_OPTIONS: FormOption[] = [
  opt("ein", "EIN (EE. UU.)", "EIN (US)"),
  opt("tin", "TIN", "TIN"),
  opt("vat", "VAT / IVA", "VAT"),
  opt("cnpj", "CNPJ (Brasil)", "CNPJ (Brazil)"),
  opt("cpf", "CPF", "CPF"),
  opt("national_id", "Registro / ID nacional", "National registration / ID"),
  opt("other", "Otro", "Other"),
];

const PERSON_ID_TYPE_OPTIONS: FormOption[] = [
  opt("ssn", "SSN (EE. UU.)", "SSN (US)"),
  opt("passport", "Pasaporte", "Passport"),
  opt("national_id", "Identificación nacional", "National ID"),
  opt("drivers_license", "Licencia de conducir", "Driver's license"),
  opt("other", "Otro", "Other"),
];

const ACCOUNT_PURPOSE_OPTIONS: FormOption[] = [
  opt("charitable_donations", "Donaciones caritativas", "Charitable donations"),
  opt("ecommerce_retail_payments", "Pagos de comercio electrónico/minorista", "E-commerce & retail payments"),
  opt("investment_purposes", "Inversión", "Investment purposes"),
  opt("payments_to_friends_or_family_abroad", "Pagos a familiares/amigos en el extranjero", "Payments to friends or family abroad"),
  opt("payroll", "Nómina", "Payroll"),
  opt("personal_or_living_expenses", "Gastos personales", "Personal or living expenses"),
  opt("protect_wealth", "Protección de patrimonio", "Protect wealth"),
  opt("purchase_goods_and_services", "Compra de bienes y servicios", "Purchase goods and services"),
  opt("receive_payments_for_goods_and_services", "Recibir pagos por bienes y servicios", "Receive payments for goods and services"),
  opt("tax_optimization", "Optimización fiscal", "Tax optimization"),
  opt("third_party_money_transmission", "Transmisión de dinero de terceros", "Third-party money transmission"),
  opt("treasury_management", "Gestión de tesorería", "Treasury management"),
  opt("other", "Otro", "Other"),
];

const SOURCE_OF_FUNDS_OPTIONS: FormOption[] = [
  opt("business_loans", "Préstamos empresariales", "Business loans"),
  opt("grants", "Subvenciones", "Grants"),
  opt("inter_company_funds", "Fondos intercompañía", "Inter-company funds"),
  opt("investment_proceeds", "Producto de inversiones", "Investment proceeds"),
  opt("owners_capital", "Capital de los socios", "Owners' capital"),
  opt("sale_of_goods_and_services", "Venta de bienes y servicios", "Sale of goods and services"),
  opt("tax_refund", "Devolución de impuestos", "Tax refund"),
  opt("third_party_funds", "Fondos de terceros", "Third-party funds"),
  opt("treasury_reserves", "Reservas de tesorería", "Treasury reserves"),
  opt("other", "Otro", "Other"),
];

const ANNUAL_REVENUE_OPTIONS: FormOption[] = [
  opt("0_99999", "Menos de $100k", "Under $100k"),
  opt("100000_999999", "$100k – $1M", "$100k – $1M"),
  opt("1000000_9999999", "$1M – $10M", "$1M – $10M"),
  opt("10000000_49999999", "$10M – $50M", "$10M – $50M"),
  opt("50000000_249999999", "$50M – $250M", "$50M – $250M"),
  opt("250000000_plus", "Más de $250M", "$250M+"),
];

const UBO_COUNT_OPTIONS: FormOption[] = [
  opt("1", "1", "1"),
  opt("2", "2", "2"),
  opt("3", "3", "3"),
  opt("4", "4", "4"),
];

// ---------- generadores ----------
/** Los 6 sub-campos de una dirección Bridge bajo `prefix`. */
function addressFields(
  prefix: string,
  opts?: { required?: boolean; visibleIf?: Condition },
): Field[] {
  const required = opts?.required ?? true;
  const visibleIf = opts?.visibleIf;
  return [
    field({ key: `${prefix}.street_line_1`, type: "short_text", label: { es: "Calle y número (línea 1)", en: "Street line 1" }, required, visibleIf }),
    field({ key: `${prefix}.street_line_2`, type: "short_text", label: { es: "Línea 2 (opcional)", en: "Street line 2 (optional)" }, visibleIf }),
    field({ key: `${prefix}.city`, type: "short_text", label: { es: "Ciudad", en: "City" }, required, visibleIf }),
    field({ key: `${prefix}.subdivision`, type: "short_text", label: { es: "Estado / Provincia", en: "State / Subdivision" }, help: { es: "ISO 3166-2 sin prefijo de país (ej. CA, NY). Requerido para EE. UU.", en: "ISO 3166-2 without country prefix (e.g. CA, NY). Required for the US." }, visibleIf }),
    field({ key: `${prefix}.postal_code`, type: "short_text", label: { es: "Código postal", en: "Postal code" }, visibleIf }),
    field({ key: `${prefix}.country`, type: "dropdown", label: { es: "País", en: "Country" }, required, options: COUNTRY_OPTIONS, help: { es: "Código ISO 3166-1 alpha-3.", en: "ISO 3166-1 alpha-3 code." }, visibleIf }),
  ];
}

/** Campos de un beneficiario final / persona asociada (slot `i`). */
function uboFields(i: number): Field[] {
  const p = `associated_persons.${i}`;
  return [
    field({ key: `${p}.first_name`, type: "short_text", label: { es: "Nombre(s)", en: "First name" }, required: true }),
    field({ key: `${p}.last_name`, type: "short_text", label: { es: "Apellido(s)", en: "Last name" }, required: true }),
    field({ key: `${p}.email`, type: "email", label: { es: "Correo electrónico", en: "Email" }, required: true }),
    field({ key: `${p}.birth_date`, type: "date", label: { es: "Fecha de nacimiento", en: "Date of birth" }, required: true, help: { es: "Debe ser mayor de 18 años.", en: "Must be 18 or older." } }),
    ...addressFields(`${p}.residential_address`, { required: true }),
    field({ key: `${p}.has_ownership`, type: "boolean", label: { es: "¿Es propietario/a del negocio?", en: "Is an owner of the business?" } }),
    field({ key: `${p}.ownership_percentage`, type: "number", label: { es: "% de propiedad", en: "Ownership %" }, validation: { min: 0, max: 100 }, visibleIf: { field: `${p}.has_ownership`, op: "eq", value: true } }),
    field({ key: `${p}.has_control`, type: "boolean", label: { es: "¿Es persona de control? (ej. CEO/CFO/COO)", en: "Is a control person? (e.g. CEO/CFO/COO)" } }),
    field({ key: `${p}.title`, type: "short_text", label: { es: "Cargo / Título", en: "Title" }, visibleIf: { field: `${p}.has_control`, op: "eq", value: true } }),
    field({ key: `${p}.is_signer`, type: "boolean", label: { es: "¿Es firmante autorizado?", en: "Is an authorized signer?" } }),
    field({ key: `${p}.identifying_information.0.type`, type: "dropdown", label: { es: "Tipo de identificación", en: "ID type" }, options: PERSON_ID_TYPE_OPTIONS, required: true }),
    field({ key: `${p}.identifying_information.0.issuing_country`, type: "dropdown", label: { es: "País emisor", en: "Issuing country" }, options: COUNTRY_OPTIONS, required: true }),
    field({ key: `${p}.identifying_information.0.number`, type: "short_text", label: { es: "Número de identificación / SSN", en: "ID number / SSN" }, required: true }),
  ];
}

/** Condición: mostrar el slot de UBO cuando `ubo_count` alcanza `min`. */
function uboCountAtLeast(min: number): Condition {
  const vals: string[] = [];
  for (let n = min; n <= 4; n++) vals.push(String(n));
  return { field: "ubo_count", op: "in", value: vals };
}

// ============================================================
// Definición del pack
// ============================================================
const sections: Section[] = [
  // 1. Datos del negocio
  section(
    "bridge_kyb_business",
    { es: "Datos del negocio (Bridge KYB)", en: "Business details (Bridge KYB)" },
    [
      field({ key: "note_bridge_kyb", type: "note", label: { es: "Información requerida por Bridge para KYB", en: "Information required by Bridge for KYB" }, help: { es: "Estos campos corresponden al alta de un negocio en Bridge (POST /v0/customers, type: business). Puedes editarlos o quitarlos según tu caso.", en: "These fields map to creating a business customer in Bridge (POST /v0/customers, type: business). Edit or remove them as needed." } }),
      field({ key: "business_legal_name", type: "short_text", label: { es: "Razón social (nombre legal)", en: "Legal business name" }, required: true }),
      field({ key: "business_trade_name", type: "short_text", label: { es: "Nombre comercial (DBA)", en: "Trade name (DBA)" } }),
      field({ key: "business_description", type: "long_text", label: { es: "Descripción / naturaleza del negocio", en: "Business description / nature" }, required: true }),
      field({ key: "business_type", type: "dropdown", label: { es: "Tipo de entidad", en: "Business type" }, options: BUSINESS_TYPE_OPTIONS, required: true }),
      field({ key: "business_industry", type: "short_text", label: { es: "Industria (código NAICS)", en: "Industry (NAICS code)" }, required: true, help: { es: "Código NAICS, ej. 5415.", en: "NAICS code, e.g. 5415." }, placeholder: { es: "5415", en: "5415" } }),
      field({ key: "is_dao", type: "boolean", label: { es: "¿La entidad es una DAO?", en: "Is the entity a DAO?" } }),
      field({ key: "email", type: "email", label: { es: "Correo de contacto del negocio", en: "Business contact email" }, required: true }),
      field({ key: "phone", type: "short_text", label: { es: "Teléfono", en: "Phone" }, help: { es: "Formato E.164, ej. +5215555555555.", en: "E.164 format, e.g. +12223334444." } }),
      field({ key: "primary_website", type: "short_text", label: { es: "Sitio web principal", en: "Primary website" }, help: { es: "Requerido si no adjuntas el documento de constitución.", en: "Required if you don't attach a formation document." } }),
      field({ key: "incorporation_date", type: "date", label: { es: "Fecha de constitución", en: "Incorporation date" } }),
    ],
  ),

  // 2. Domicilio registrado
  section(
    "bridge_kyb_registered_address",
    { es: "Domicilio registrado", en: "Registered address" },
    addressFields("registered_address", { required: true }),
    { description: { es: "Domicilio legal / registrado de la entidad.", en: "Legal / registered address of the entity." } },
  ),

  // 3. Domicilio físico
  section(
    "bridge_kyb_physical_address",
    { es: "Domicilio físico", en: "Physical address" },
    [
      field({ key: "physical_same_as_registered", type: "boolean", label: { es: "El domicilio físico es el mismo que el registrado", en: "Physical address is the same as registered" } }),
      ...addressFields("physical_address", {
        required: true,
        visibleIf: { field: "physical_same_as_registered", op: "neq", value: true },
      }),
    ],
    { description: { es: "Domicilio operativo principal (sin apartados postales).", en: "Principal operating address (no PO boxes)." } },
  ),

  // 4. Identificación fiscal
  section(
    "bridge_kyb_tax",
    { es: "Identificación fiscal", en: "Tax identification" },
    [
      field({ key: "identifying_information.0.type", type: "dropdown", label: { es: "Tipo de identificación fiscal", en: "Tax ID type" }, options: BUSINESS_TAX_TYPE_OPTIONS, required: true }),
      field({ key: "identifying_information.0.issuing_country", type: "dropdown", label: { es: "País emisor", en: "Issuing country" }, options: COUNTRY_OPTIONS, required: true }),
      field({ key: "identifying_information.0.number", type: "short_text", label: { es: "Número (EIN / RFC / registro)", en: "Number (EIN / TIN / registration)" }, required: true }),
      field({ key: "has_foreign_tax_registration", type: "boolean", label: { es: "¿Tiene registro fiscal en el extranjero?", en: "Has foreign tax registration?" } }),
    ],
  ),

  // 5. Beneficiarios finales (UBO 1)
  section(
    "bridge_kyb_ubo",
    { es: "Beneficiarios finales", en: "Beneficial owners" },
    [
      field({ key: "note_ubo", type: "note", label: { es: "Beneficiarios finales y persona de control", en: "Beneficial owners & control person" }, help: { es: "Se requiere KYC de cada persona con ≥25% de propiedad, más al menos una persona de control (ej. CEO/CFO).", en: "KYC is required for each individual owning ≥25%, plus at least one control person (e.g. CEO/CFO)." } }),
      field({ key: "ubo_count", type: "dropdown", label: { es: "¿Cuántos beneficiarios/personas asociadas declararás?", en: "How many owners / associated persons will you declare?" }, options: UBO_COUNT_OPTIONS, required: true }),
      field({ key: "ownership_threshold", type: "number", label: { es: "Umbral de propiedad (%)", en: "Ownership threshold (%)" }, validation: { min: 5, max: 25 }, placeholder: { es: "25", en: "25" }, help: { es: "Entre 5 y 25. Por defecto 25.", en: "Between 5 and 25. Default 25." } }),
      field({ key: "has_material_intermediary_ownership", type: "boolean", label: { es: "¿Existe propiedad ≥25% a través de entidades intermediarias?", en: "Is ≥25% owned via intermediary entities?" } }),
      ...uboFields(0),
    ],
  ),

  // 6-8. UBO 2-4 (visibilidad condicional por ubo_count)
  section("bridge_kyb_ubo_2", { es: "Beneficiario 2", en: "Beneficial owner 2" }, uboFields(1), { visibleIf: uboCountAtLeast(2) }),
  section("bridge_kyb_ubo_3", { es: "Beneficiario 3", en: "Beneficial owner 3" }, uboFields(2), { visibleIf: uboCountAtLeast(3) }),
  section("bridge_kyb_ubo_4", { es: "Beneficiario 4", en: "Beneficial owner 4" }, uboFields(3), { visibleIf: uboCountAtLeast(4) }),

  // 9. Documentos
  section(
    "bridge_kyb_documents",
    { es: "Documentos", en: "Documents" },
    [
      field({ key: "documents.business_formation", type: "file", label: { es: "Documento de constitución", en: "Business formation document" }, file: DOC_FILE, help: { es: "Acta constitutiva / certificado de constitución. Requerido si no proporcionas sitio web.", en: "Articles/certificate of incorporation. Required if no website is provided." } }),
      field({ key: "documents.ownership_information", type: "file", label: { es: "Estructura accionaria / propiedad", en: "Ownership information" }, file: DOC_FILE, help: { es: "Organigrama de propiedad o registro de accionistas.", en: "Ownership chart or shareholder register." } }),
      field({ key: "documents.proof_of_address", type: "file", label: { es: "Comprobante de domicilio", en: "Proof of address" }, file: DOC_FILE }),
    ],
  ),

  // 10. Cumplimiento / riesgo (compacta)
  section(
    "bridge_kyb_compliance",
    { es: "Cumplimiento", en: "Compliance" },
    [
      field({ key: "account_purpose", type: "dropdown", label: { es: "Propósito de la cuenta", en: "Account purpose" }, options: ACCOUNT_PURPOSE_OPTIONS, required: true }),
      field({ key: "account_purpose_other", type: "short_text", label: { es: "Especifica el propósito", en: "Specify the purpose" }, visibleIf: { field: "account_purpose", op: "eq", value: "other" } }),
      field({ key: "source_of_funds", type: "dropdown", label: { es: "Origen de los fondos", en: "Source of funds" }, options: SOURCE_OF_FUNDS_OPTIONS, required: true }),
      field({ key: "estimated_annual_revenue_usd", type: "dropdown", label: { es: "Ingresos anuales estimados (USD)", en: "Estimated annual revenue (USD)" }, options: ANNUAL_REVENUE_OPTIONS, required: true }),
    ],
  ),

  // 11. Términos de servicio
  section(
    "bridge_kyb_tos",
    { es: "Términos de servicio (Bridge)", en: "Terms of service (Bridge)" },
    [
      field({ key: "note_tos", type: "note", label: { es: "Aceptación de Términos de Servicio", en: "Terms of service acceptance" }, help: { es: "El signed_agreement_id se obtiene mediante el flujo hospedado de ToS de Bridge (no se captura como texto en este formulario).", en: "The signed_agreement_id is obtained via Bridge's hosted ToS flow (it is not captured as text in this form)." } }),
      field({ key: "accept_terms", type: "boolean", label: { es: "Confirmo que el negocio aceptará los Términos de Servicio de Bridge", en: "I confirm the business will accept Bridge's Terms of Service" }, required: true }),
    ],
  ),
];

export const bridgeKybPreset: FieldPreset = {
  id: "bridge_kyb",
  label: { es: "Bridge KYB", en: "Bridge KYB" },
  description: {
    es: "Campos requeridos por Bridge para alta de negocio y KYB.",
    en: "Fields required by Bridge for business onboarding and KYB.",
  },
  sections,
};

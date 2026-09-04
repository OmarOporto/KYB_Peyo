/**
 * Lectura de un resultado de DIDIT para presentarlo. Puro y client-safe: no
 * toca red ni Supabase y devuelve CLAVES de i18n (no texto), para que lo
 * consuman tanto la tarjeta operativa (`AmlCheckCard`) como el informe
 * (`ReportCheckBlock`) sin duplicar la interpretación del envelope.
 */

export type Node = Record<string, unknown>;

/** Fila de aml_checks (subset que consumen las vistas). */
export type AmlCheckRow = {
  id: string;
  provider: string;
  status: string;
  result: unknown;
  feature: string | null;
  field_key: string | null;
  score: number | null;
  created_at: string;
};

// El envelope de DIDIT anida el resultado bajo una clave por feature.
export const NODE_KEYS: Record<string, string[]> = {
  aml_screening: ["aml"],
  id_verification: ["id_verification"],
  face_match: ["face_match"],
  proof_of_address: ["poa", "proof_of_address"],
  age_estimation: ["age_estimation"],
  liveness: ["liveness"],
  database_validation: ["database_validation"],
  kyb_registry: ["kyb_registry"],
};

// Features cuyo `score` es RIESGO (mayor = peor); el resto es confianza (mayor = mejor).
export const RISK_FEATURES = new Set(["aml_screening"]);

export function nodeOf(feature: string | null, result: unknown): Node | null {
  if (!result || typeof result !== "object") return null;
  const env = result as Node;
  const keys = feature ? (NODE_KEYS[feature] ?? [feature]) : [];
  for (const k of keys) {
    const v = env[k];
    if (v && typeof v === "object") return v as Node;
  }
  return null;
}

/** Envelope crudo del check como objeto (raíz del result). */
export function envelopeOf(result: unknown): Node {
  return result && typeof result === "object" ? (result as Node) : {};
}

export function amlToBadge(status: string): string {
  return status === "passed"
    ? "approved"
    : status === "flagged"
      ? "rejected"
      : status === "error"
        ? "expired"
        : "under_review";
}

/** Formatea un valor escalar para mostrarlo; devuelve "" para lo que no aplica. */
export function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return "";
}

export function joinType(a: unknown, b: unknown): string {
  return [a, b].filter((x) => typeof x === "string" && x).join(" · ");
}

/** Clave de `admin.checkFields` que etiqueta el medidor de score de la feature. */
export function scoreLabelKey(feature: string | null): string {
  switch (feature) {
    case "face_match":
      return "matchScore";
    case "liveness":
      return "liveness";
    case "aml_screening":
      return "riskScore";
    default:
      return "confidence";
  }
}

/**
 * Campos clave curados por feature (se omiten los nulos). `labelKey` es una
 * clave de `admin.checkFields.*`.
 */
export function curatedRows(
  feature: string | null,
  node: Node | null,
): { labelKey: string; value: string }[] {
  const rows: { labelKey: string; value: string }[] = [];
  if (!node) return rows;
  const push = (labelKey: string, v: unknown) => {
    const s = fmt(v);
    if (s) rows.push({ labelKey, value: s });
  };

  switch (feature) {
    case "id_verification":
      push("fullName", node.full_name);
      push("docType", joinType(node.document_type, node.document_subtype));
      push("docNumber", node.document_number);
      push("dob", node.date_of_birth);
      push("issuingState", node.issuing_state_name ?? node.issuing_state);
      push("expiration", node.expiration_date);
      push("gender", node.gender);
      push("age", node.age);
      break;
    case "age_estimation": {
      const age = node.age_estimation;
      if (typeof age === "number") push("estimatedAge", Math.round(age));
      break;
    }
    case "proof_of_address":
      push("docType", joinType(node.document_type, node.document_subtype));
      push("issuer", node.issuer);
      push("issueDate", node.issue_date);
      push("nameOnDoc", node.name_on_document);
      push("address", node.poa_formatted_address ?? node.poa_address);
      break;
    case "liveness":
      push("faceQuality", node.face_quality);
      break;
    case "aml_screening":
      push("entityType", node.entity_type);
      push("totalHits", node.total_hits);
      break;
    case "kyb_registry":
      push("companyName", node.company_name);
      push("regNumber", node.registration_number);
      push("registryStatus", node.registry_status);
      push("registryCountry", node.country_code);
      push("incorporationDate", node.incorporation_date);
      push("address", node.registered_address);
      break;
  }
  return rows;
}

// Normalizadores para la comparación declarado vs registro oficial.
function normNameCmp(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function normRegCmp(s: string): string {
  return s.toUpperCase().replace(/[\s.\-/]+/g, "");
}

export type KybVerdict = "exact" | "different" | "review";

/**
 * Compara lo declarado por el solicitante contra el perfil registral oficial.
 * `labelKey` es una clave de `admin.checkFields.*`.
 */
export function kybCompare(
  declared: Node,
  node: Node | null,
): { labelKey: string; verdict: KybVerdict }[] {
  const out: { labelKey: string; verdict: KybVerdict }[] = [];
  if (!node) return out;

  const decName = fmt(declared.name);
  const decReg = fmt(declared.registration_number);
  const decCountry = fmt(declared.country);
  const offName = fmt(node.company_name);
  const offReg = fmt(node.registration_number);
  const offCountry = fmt(node.country_code);

  if (decName && offName) {
    out.push({
      labelKey: "companyName",
      verdict: normNameCmp(decName) === normNameCmp(offName) ? "exact" : "review",
    });
  }
  if (decReg && offReg) {
    out.push({
      labelKey: "regNumber",
      verdict: normRegCmp(decReg) === normRegCmp(offReg) ? "exact" : "different",
    });
  }
  if (decCountry && offCountry) {
    out.push({
      labelKey: "registryCountry",
      verdict:
        decCountry.toUpperCase() === offCountry.toUpperCase() ? "exact" : "different",
    });
  }
  return out;
}

/**
 * Nombre del sujeto del informe: el del documento de identidad o, para KYB, la
 * razón social del registro. Devuelve `null` si ninguna verificación lo trae, y
 * entonces la portada cae a la referencia de la solicitud.
 */
export function subjectName(checks: AmlCheckRow[]): string | null {
  for (const c of checks) {
    if (c.feature !== "id_verification") continue;
    const name = fmt(nodeOf(c.feature, c.result)?.full_name);
    if (name) return name;
  }
  for (const c of checks) {
    if (c.feature !== "kyb_registry") continue;
    const envl = envelopeOf(c.result);
    // El perfil oficial manda; si el ciclo no llegó al select, sirve lo declarado.
    const official = fmt(nodeOf(c.feature, c.result)?.company_name);
    const declared = fmt((envl.declared as Node | undefined)?.name);
    if (official || declared) return official || declared;
  }
  return null;
}

/** Normaliza un score a 0–100 (DIDIT devuelve 0–1 en unas features y 0–100 en otras). */
export function scorePct(value: number): number {
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
}

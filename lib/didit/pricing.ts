// ============================================================
// Costos de DIDIT — client-safe (sin imports de servidor)
// ------------------------------------------------------------
// La fuente de verdad del monto es DIDIT: cada sesión standalone de persona
// trae `cost_breakdown` en GET /v3/session/{id}/decision/?include=events.
// Ese campo NO figura en su documentación pública, así que se lee con
// tolerancia y estas tarifas quedan de respaldo:
//   - kyb_search / kyb_select: las sesiones de empresa no informan costo, la
//     tarifa pública es la única referencia.
//   - por feature: solo si una sesión nunca llega a informar su costo.
//
// USD, precios standalone publicados por DIDIT (docs.didit.me/getting-started/pricing).
// ============================================================

export type DiditChargeKind = "verification" | "kyb_search" | "kyb_select";
export type DiditChargeSource = "didit" | "tariff";

export const DIDIT_CURRENCY = "USD";

/** Tarifa pública de la validación de empresa (sin cost_breakdown en DIDIT). */
export const DIDIT_KYB_TARIFFS: Record<"kyb_search" | "kyb_select", number> = {
  // Solo si DIDIT la resuelve con una fuente paga; vacías y fallidas no se cobran.
  kyb_search: 0.5,
  kyb_select: 2.0,
};

/** Respaldo por feature cuando una sesión nunca informa su costo. */
export const DIDIT_FEATURE_TARIFFS: Record<string, number> = {
  id_verification: 0.2,
  aml_screening: 0.2,
  liveness: 0.05,
  face_match: 0.05,
  proof_of_address: 0.2,
  age_estimation: 0.1,
  database_validation: 0.2,
  email_verification: 0.03,
  phone_verification: 0.04,
};

/** `api_service` / feature de una sesión DIDIT → feature del builder. */
const API_SERVICE_FEATURE: Record<string, string> = {
  ID_VERIFICATION: "id_verification",
  AML: "aml_screening",
  FACE_MATCH: "face_match",
  PASSIVE_LIVENESS: "liveness",
  LIVENESS: "liveness",
  POA: "proof_of_address",
  PROOF_OF_ADDRESS: "proof_of_address",
  AGE_ESTIMATION: "age_estimation",
  DATABASE_VALIDATION: "database_validation",
  EMAIL_VERIFICATION: "email_verification",
  PHONE_VERIFICATION: "phone_verification",
};

export function featureFromApiService(value: unknown): string | null {
  const key = String(value ?? "").trim().toUpperCase();
  if (!key) return null;
  return API_SERVICE_FEATURE[key] ?? key.toLowerCase();
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface CostBreakdown {
  total: number;
  items: { usageType: string; price: number }[];
  /** Tal cual lo devolvió DIDIT, para guardarlo como evidencia. */
  raw: Record<string, unknown>;
}

/**
 * Lee `cost_breakdown` de una decisión de sesión. `null` si no está o no se
 * entiende: quien llama lo deja pendiente en vez de inventar un monto.
 */
export function parseCostBreakdown(decision: unknown): CostBreakdown | null {
  if (!decision || typeof decision !== "object") return null;
  const cb = (decision as Record<string, unknown>).cost_breakdown;
  if (!cb || typeof cb !== "object" || Array.isArray(cb)) return null;
  const node = cb as Record<string, unknown>;

  const items = (Array.isArray(node.items) ? node.items : [])
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return { usageType: String(o.usage_type ?? ""), price: Number(o.price) };
    })
    .filter((it) => Number.isFinite(it.price));

  // Los montos pueden venir como número o como string decimal.
  let total = Number(node.total_price);
  if (node.total_price == null || !Number.isFinite(total)) {
    if (!items.length) return null;
    total = items.reduce((n, it) => n + it.price, 0);
  }
  return { total: round4(total), items, raw: node };
}

// ------------------------------------------------------------
// Agregación para el panel
// ------------------------------------------------------------

export interface ChargeRow {
  feature: string;
  kind: DiditChargeKind;
  amount: number | null;
  source: DiditChargeSource;
  requestId: string | null;
  formId: string | null;
  createdAt: string;
  syncedAt: string | null;
}

export interface PeriodTotal {
  /** Suma de los cargos con monto. */
  amount: number;
  /** Cargos (con o sin monto): lo que ve un miembro. */
  count: number;
  /** Algún monto del período sale de una tarifa y no de DIDIT. */
  estimated: boolean;
}

export interface LineTotal {
  /** feature para verificaciones; `kyb_search` / `kyb_select` para empresa. */
  line: string;
  kind: DiditChargeKind;
  month: PeriodTotal;
  total: PeriodTotal;
  /** Promedio por cargo con monto (el precio unitario, si no cambió). */
  unit: number | null;
}

export interface FormTotal {
  formId: string | null;
  requests: number;
  total: number;
  avgPerRequest: number;
  estimated: boolean;
}

export interface ChargeSummary {
  month: PeriodTotal;
  last30: PeriodTotal;
  all: PeriodTotal;
  lines: LineTotal[];
  forms: FormTotal[];
  /** Cargos cuyo monto DIDIT todavía no informó. */
  pending: number;
  lastSyncedAt: string | null;
}

const emptyPeriod = (): PeriodTotal => ({ amount: 0, count: 0, estimated: false });

function add(p: PeriodTotal, r: ChargeRow) {
  p.count += 1;
  if (r.amount != null) {
    p.amount += r.amount;
    if (r.source === "tariff") p.estimated = true;
  }
}

const finish = (p: PeriodTotal): PeriodTotal => ({ ...p, amount: round4(p.amount) });

/** Totales por período, por línea de verificación y por formulario. */
export function summarizeCharges(rows: ChargeRow[], now: Date): ChargeSummary {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const since30 = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  const month = emptyPeriod();
  const last30 = emptyPeriod();
  const all = emptyPeriod();
  const lines = new Map<string, LineTotal & { priced: number }>();
  const forms = new Map<string, { formId: string | null; requests: Set<string>; total: number; estimated: boolean }>();
  let pending = 0;
  let lastSyncedAt: string | null = null;

  for (const r of rows) {
    const at = new Date(r.createdAt).getTime();
    add(all, r);
    if (at >= since30) add(last30, r);
    if (at >= monthStart) add(month, r);
    if (r.amount == null) pending += 1;
    if (r.syncedAt && (!lastSyncedAt || r.syncedAt > lastSyncedAt)) lastSyncedAt = r.syncedAt;

    const key = r.kind === "verification" ? r.feature : r.kind;
    const line = lines.get(key) ?? {
      line: key,
      kind: r.kind,
      month: emptyPeriod(),
      total: emptyPeriod(),
      unit: null,
      priced: 0,
    };
    add(line.total, r);
    if (at >= monthStart) add(line.month, r);
    if (r.amount != null) line.priced += 1;
    lines.set(key, line);

    const formKey = r.formId ?? "";
    const form = forms.get(formKey) ?? {
      formId: r.formId,
      requests: new Set<string>(),
      total: 0,
      estimated: false,
    };
    if (r.requestId) form.requests.add(r.requestId);
    if (r.amount != null) {
      form.total += r.amount;
      if (r.source === "tariff") form.estimated = true;
    }
    forms.set(formKey, form);
  }

  return {
    month: finish(month),
    last30: finish(last30),
    all: finish(all),
    lines: [...lines.values()]
      .map(({ priced, ...l }) => ({
        ...l,
        month: finish(l.month),
        total: finish(l.total),
        unit: priced ? round4(l.total.amount / priced) : null,
      }))
      .sort((a, b) => b.total.amount - a.total.amount || b.total.count - a.total.count),
    forms: [...forms.values()]
      .map((f) => ({
        formId: f.formId,
        requests: f.requests.size,
        total: round4(f.total),
        avgPerRequest: f.requests.size ? round4(f.total / f.requests.size) : 0,
        estimated: f.estimated,
      }))
      .sort((a, b) => b.total - a.total),
    pending,
    lastSyncedAt,
  };
}

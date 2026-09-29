import { test } from "node:test";
import assert from "node:assert/strict";
import {
  featureFromApiService,
  parseCostBreakdown,
  summarizeCharges,
  type ChargeRow,
} from "./pricing.ts";

// Payloads reales de GET /v3/session/{id}/decision/?include=events (2026-09-29).
const REAL = {
  database_validation: {
    total_price: 0.2,
    items: [
      {
        usage_type: "database_validation_api",
        price: 0.2,
        details: { service_id: "bol_cedula", issuing_state: "BOL", validation_type: "one_by_one" },
      },
    ],
  },
  aml: { total_price: 0.2, items: [{ usage_type: "aml_api", price: 0.2, details: null }] },
  liveness: {
    total_price: 0.05,
    items: [{ usage_type: "passive_liveness_api", price: 0.05, details: null }],
  },
  face_match: { total_price: 0.05, items: [{ usage_type: "face_match_api", price: 0.05, details: null }] },
  id_verification: {
    total_price: 0.2,
    items: [{ usage_type: "id_verification_api", price: 0.2, details: null }],
  },
};

test("parseCostBreakdown lee los payloads reales de DIDIT", () => {
  const totals = Object.values(REAL).map((cb) => parseCostBreakdown({ cost_breakdown: cb })?.total);
  assert.deepEqual(totals, [0.2, 0.2, 0.05, 0.05, 0.2]);
  const aml = parseCostBreakdown({ cost_breakdown: REAL.aml });
  assert.deepEqual(aml?.items, [{ usageType: "aml_api", price: 0.2 }]);
  assert.equal(aml?.raw, REAL.aml);
});

test("parseCostBreakdown devuelve null sin cost_breakdown (sesiones de empresa)", () => {
  assert.equal(parseCostBreakdown({ session_kind: "business" }), null);
  assert.equal(parseCostBreakdown(null), null);
  assert.equal(parseCostBreakdown({ cost_breakdown: null }), null);
  assert.equal(parseCostBreakdown({ cost_breakdown: [] }), null);
  assert.equal(parseCostBreakdown({ cost_breakdown: { items: [] } }), null);
});

test("parseCostBreakdown tolera montos string y total ausente", () => {
  assert.equal(parseCostBreakdown({ cost_breakdown: { total_price: "0.3000" } })?.total, 0.3);
  const summed = parseCostBreakdown({
    cost_breakdown: { items: [{ usage_type: "a", price: 0.1 }, { usage_type: "b", price: "0.05" }] },
  });
  assert.equal(summed?.total, 0.15);
});

test("featureFromApiService mapea al vocabulario del builder", () => {
  assert.equal(featureFromApiService("PASSIVE_LIVENESS"), "liveness");
  assert.equal(featureFromApiService("AML"), "aml_screening");
  assert.equal(featureFromApiService("NEW_THING"), "new_thing");
  assert.equal(featureFromApiService(null), null);
});

const row = (over: Partial<ChargeRow>): ChargeRow => ({
  feature: "aml_screening",
  kind: "verification",
  amount: 0.2,
  source: "didit",
  requestId: "r1",
  formId: "f1",
  createdAt: "2026-09-20T10:00:00Z",
  syncedAt: "2026-09-20T10:00:01Z",
  ...over,
});

test("summarizeCharges separa períodos, líneas y formularios", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const s = summarizeCharges(
    [
      row({}),
      row({ feature: "face_match", amount: 0.05 }),
      row({ requestId: "r2", createdAt: "2026-09-25T10:00:00Z" }),
      // Julio: fuera del mes y de los 30 días.
      row({
        feature: "kyb_registry",
        kind: "kyb_select",
        amount: 2,
        source: "tariff",
        requestId: "r3",
        formId: "f2",
        createdAt: "2026-07-23T16:27:00Z",
      }),
      // Pendiente: cuenta como verificación pero no suma monto.
      row({ amount: null, requestId: "r2", syncedAt: null }),
    ],
    now,
  );

  assert.deepEqual(s.month, { amount: 0.45, count: 4, estimated: false });
  assert.deepEqual(s.last30, s.month);
  assert.deepEqual(s.all, { amount: 2.45, count: 5, estimated: true });
  assert.equal(s.pending, 1);
  assert.equal(s.lastSyncedAt, "2026-09-20T10:00:01Z");

  const aml = s.lines.find((l) => l.line === "aml_screening");
  assert.equal(aml?.total.count, 3);
  assert.equal(aml?.total.amount, 0.4);
  assert.equal(aml?.unit, 0.2);
  const select = s.lines.find((l) => l.line === "kyb_select");
  assert.equal(select?.month.count, 0);
  assert.equal(select?.unit, 2);
  assert.equal(s.lines[0].line, "kyb_select");

  const f1 = s.forms.find((f) => f.formId === "f1");
  assert.deepEqual(f1, { formId: "f1", requests: 2, total: 0.45, avgPerRequest: 0.225, estimated: false });
  assert.equal(s.forms.find((f) => f.formId === "f2")?.estimated, true);
});

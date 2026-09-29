import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutPrices } from "./pricing.ts";

const accounted = {
  inputTokens: 1200,
  outputTokens: 800,
  inputPer1M: 2,
  outputPer1M: 8,
  cost: 0.0088,
  currency: "USD",
  model: "gpt-4.1",
  provider: "openai",
};

test("withoutPrices deja todo al admin", () => {
  assert.deepEqual(withoutPrices(accounted, true), accounted);
});

test("withoutPrices oculta tarifas y costo a un miembro, pero no los tokens", () => {
  const out = withoutPrices(accounted, false);
  assert.equal(out.inputPer1M, null);
  assert.equal(out.outputPer1M, null);
  assert.equal(out.cost, null);
  assert.equal(out.inputTokens, 1200);
  assert.equal(out.outputTokens, 800);
  assert.equal(out.model, "gpt-4.1");
});

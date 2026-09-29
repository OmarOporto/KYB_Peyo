import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRequestForm, type FormCandidate } from "./formChoice.ts";

const ACME = "00000000-0000-4000-8000-000000000002";
const PEYO = "00000000-0000-4000-8000-000000000001";

const form = (id: string, over: Partial<FormCandidate> = {}): FormCandidate => ({
  id,
  org_id: ACME,
  status: "published",
  version: 3,
  ...over,
});

test("usa el form_id pedido si es de la org y está publicado", () => {
  const f = form("f1");
  assert.deepEqual(pickRequestForm({ orgId: ACME, requestedId: "f1", requested: f }), {
    ok: true,
    formId: "f1",
    revision: 3,
  });
});

test("un form_id de otra org, en borrador o inexistente es invalid_form (sin fallback)", () => {
  const fallback = form("default");
  for (const requested of [
    form("f1", { org_id: PEYO }),
    form("f1", { status: "draft" }),
    form("f1", { status: "archived" }),
    null,
  ]) {
    assert.deepEqual(
      pickRequestForm({
        orgId: ACME,
        requestedId: "f1",
        requested,
        keyDefault: fallback,
        latestPublished: fallback,
      }),
      { ok: false, error: "invalid_form" },
    );
  }
});

test("sin form_id usa el default de la key si sigue publicado", () => {
  assert.deepEqual(
    pickRequestForm({ orgId: ACME, keyDefault: form("kd"), latestPublished: form("latest") }),
    { ok: true, formId: "kd", revision: 3 },
  );
});

test("si el default de la key ya no sirve, cae al último publicado de la org", () => {
  for (const keyDefault of [form("kd", { status: "draft" }), form("kd", { org_id: PEYO }), null]) {
    assert.deepEqual(
      pickRequestForm({ orgId: ACME, keyDefault, latestPublished: form("latest") }),
      { ok: true, formId: "latest", revision: 3 },
    );
  }
});

test("nunca elige un publicado de otra org", () => {
  assert.deepEqual(
    pickRequestForm({ orgId: ACME, latestPublished: form("ajeno", { org_id: PEYO }) }),
    { ok: false, error: "no_published_form" },
  );
  assert.deepEqual(pickRequestForm({ orgId: ACME }), { ok: false, error: "no_published_form" });
});

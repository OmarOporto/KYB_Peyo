import { test } from "node:test";
import assert from "node:assert/strict";
import { publicAmlChecks, INTERNAL_RESULT_KEYS } from "./amlPublic.ts";

/**
 * Se ejecuta con `npm test` (node --test --experimental-strip-types).
 *
 * El caso que importa es el primero: `search_token` autentica el callback sin
 * firma de DIDIT, así que si vuelve a salir por la API o por el webhook, el
 * cliente puede falsificar el resultado registral de su propia solicitud.
 */

test("no publica el search_token de una búsqueda registral pendiente", () => {
  const rows = [
    {
      provider: "didit",
      status: "pending",
      result: {
        phase: "search",
        declared: { name: "ACME SA", country: "ES" },
        kyb_search: { request_id: "didit-123" },
        search_token: "3f1a0c62-0000-4000-8000-000000000000",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const out = publicAmlChecks(rows);
  const serialized = JSON.stringify(out);

  assert.equal(
    serialized.includes("3f1a0c62-0000-4000-8000-000000000000"),
    false,
    "el search_token se filtró en la respuesta",
  );
  assert.equal("search_token" in (out[0].result as object), false);
});

test("conserva el resto del contrato intacto", () => {
  const rows = [
    {
      provider: "didit",
      status: "pending",
      result: {
        phase: "search",
        declared: { name: "ACME SA" },
        search_token: "secreto",
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  const out = publicAmlChecks(rows);

  assert.equal(out[0].provider, "didit");
  assert.equal(out[0].status, "pending");
  assert.equal(out[0].created_at, "2026-01-01T00:00:00Z");
  assert.deepEqual(out[0].result, {
    phase: "search",
    declared: { name: "ACME SA" },
  });
});

test("filtra las claves internas a cualquier profundidad", () => {
  const rows = [
    {
      result: {
        a: { b: [{ search_token: "secreto", keep: 1 }] },
      },
    },
  ];

  const out = publicAmlChecks(rows);

  assert.equal(JSON.stringify(out).includes("secreto"), false);
  assert.deepEqual(out[0].result, { a: { b: [{ keep: 1 }] } });
});

test("no rompe con result nulo, ausente o no-objeto", () => {
  assert.deepEqual(publicAmlChecks(null), []);
  assert.deepEqual(publicAmlChecks(undefined), []);
  assert.deepEqual(publicAmlChecks([{ result: null }]), [{ result: null }]);
  assert.deepEqual(publicAmlChecks([{ result: "texto" }]), [{ result: "texto" }]);
  assert.deepEqual(publicAmlChecks([{ provider: "didit" }]), [
    { provider: "didit", result: undefined },
  ]);
});

test("la lista de claves internas incluye el token del callback", () => {
  // Si alguien la vacía, el test de arriba ya falla; esto deja la intención escrita.
  assert.ok(INTERNAL_RESULT_KEYS.includes("search_token"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessOrg,
  isUuid,
  resolveCreationOrg,
  resolveOrgScope,
  type TenantActor,
} from "./tenantRules.ts";

const PEYO = "00000000-0000-4000-8000-000000000001";
const ACME = "00000000-0000-4000-8000-000000000002";
const GHOST = "00000000-0000-4000-8000-0000000000ff";
const KNOWN = [PEYO, ACME];

const admin: TenantActor = { role: "admin", orgId: PEYO };
const bob: TenantActor = { role: "analyst", orgId: ACME };

test("isUuid acepta uuids y nada más", () => {
  assert.equal(isUuid(PEYO), true);
  assert.equal(isUuid("no-es-uuid"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(`${PEYO}' or 1=1`), false);
});

test("canAccessOrg: el miembro solo accede a su org, el admin a todas", () => {
  assert.equal(canAccessOrg(bob, ACME), true);
  assert.equal(canAccessOrg(bob, PEYO), false);
  assert.equal(canAccessOrg(admin, ACME), true);
  assert.equal(canAccessOrg(admin, PEYO), true);
  // Sin org no hay acceso, ni para el admin: es un recurso huérfano o inexistente.
  assert.equal(canAccessOrg(admin, null), false);
  assert.equal(canAccessOrg(bob, undefined), false);
});

test("resolveOrgScope: el miembro ignora ?org=", () => {
  assert.equal(resolveOrgScope(bob, PEYO, KNOWN), ACME);
  assert.equal(resolveOrgScope(bob, undefined, KNOWN), ACME);
  assert.equal(resolveOrgScope(bob, "basura", KNOWN), ACME);
});

test("resolveOrgScope: el admin elige una org conocida o ve todas", () => {
  assert.equal(resolveOrgScope(admin, ACME, KNOWN), ACME);
  assert.equal(resolveOrgScope(admin, undefined, KNOWN), null);
  assert.equal(resolveOrgScope(admin, "basura", KNOWN), null);
  assert.equal(resolveOrgScope(admin, GHOST, KNOWN), null);
});

test("resolveCreationOrg: el miembro crea en la suya pida lo que pida", () => {
  assert.equal(resolveCreationOrg(bob, PEYO, KNOWN), ACME);
  assert.equal(resolveCreationOrg(bob, null, KNOWN), ACME);
});

test("resolveCreationOrg: el admin crea en la elegida, en la suya por defecto, y nunca en una inexistente", () => {
  assert.equal(resolveCreationOrg(admin, ACME, KNOWN), ACME);
  assert.equal(resolveCreationOrg(admin, null, KNOWN), PEYO);
  assert.equal(resolveCreationOrg(admin, "", KNOWN), PEYO);
  assert.equal(resolveCreationOrg(admin, GHOST, KNOWN), null);
  assert.equal(resolveCreationOrg(admin, "basura", KNOWN), null);
});

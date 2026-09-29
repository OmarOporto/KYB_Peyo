"use server";

import { listActiveAdmins, listOrgSummaries } from "@/lib/auth/accounts";
import {
  canSuspendOrg,
  normalizeOrgName,
  removesLastAdmin,
  slugify,
  uniqueSlug,
  type Role,
} from "@/lib/auth/accountRules";
import { isUuid } from "@/lib/auth/tenantRules";
import { logAudit } from "@/lib/kyb/service";
import { sendAlert } from "@/lib/mail/alert";
import { createServiceClient } from "@/lib/supabase/service";
import {
  accountAdmin,
  dbErrorKey,
  isActiveAdmin,
  loadTarget,
  revalidateAccounts,
  stepUp,
  type AccountResult,
} from "./guards";

/**
 * Gestión de cuentas desde el panel (solo admin, con 2FA activo).
 *
 * Todas las acciones reciben ids del navegador y escriben con service role, así
 * que cada una: exige admin con 2FA, valida el id, carga el destino y aplica
 * las reglas de accountRules. Las reglas de fondo ("nunca cero admins", "no
 * suspender una org con admins") las garantiza además la base (triggers de
 * 0028_accounts.sql); sus errores se traducen acá.
 *
 * `error` es una clave de i18n ("accounts.*" o "auth.*").
 */
// ---------------------------------------------------------------------------
// Usuarios: datos y estado
// ---------------------------------------------------------------------------

/**
 * Nombre, rol y organización de otra cuenta. Dar rol admin pide la contraseña
 * del admin que actúa: es la acción que más acceso otorga.
 */
export async function updateAccountAction(
  userId: string,
  input: { fullName: string; role: Role; orgId: string },
  stepUpPassword?: string,
): Promise<AccountResult> {
  const gate = await accountAdmin();
  if (!gate.ok) return gate;
  const { actor } = gate;
  const loaded = await loadTarget(actor, userId, "role");
  if (!loaded.ok) return loaded;
  const { target } = loaded;

  const fullName = input.fullName.trim().replace(/\s+/g, " ").slice(0, 120) || null;
  const role: Role = input.role === "admin" ? "admin" : "analyst";
  if (!isUuid(input.orgId)) return { ok: false, error: "accounts.errOrgInvalid" };

  const promoting = role === "admin" && target.role !== "admin";
  const demoting = role !== "admin" && target.role === "admin";
  if (promoting) {
    const err = await stepUp(actor, stepUpPassword);
    if (err) return { ok: false, error: err };
  }
  if (demoting && target.status === "active") {
    const admins = await listActiveAdmins();
    if (removesLastAdmin({ targetIsActiveAdmin: true, activeAdmins: admins.length })) {
      return { ok: false, error: "accounts.errLastAdmin" };
    }
  }

  const { error } = await createServiceClient()
    .from("analysts")
    .update({ full_name: fullName, role, org_id: input.orgId })
    .eq("user_id", userId);
  if (error) return { ok: false, error: dbErrorKey(error) };

  await logAudit({
    requestId: null,
    orgId: input.orgId,
    actor: actor.email,
    actorUserId: actor.userId,
    action: "account_updated",
    metadata: {
      targetUserId: userId,
      targetEmail: target.email,
      from: { fullName: target.fullName, role: target.role, orgId: target.orgId },
      to: { fullName, role, orgId: input.orgId },
    },
  });
  if (promoting || demoting) {
    await sendAlert(`[KYB] Permisos de admin: ${target.email}`, [
      `${actor.email} ${promoting ? "dio rol admin a" : "quitó el rol admin a"} ${target.email}.`,
    ]);
  }
  revalidateAccounts(userId);
  return { ok: true };
}

/** Suspende una cuenta: no entra al panel y ve el email del admin de contacto. */
export async function suspendAccountAction(userId: string, contactId: string): Promise<AccountResult> {
  const gate = await accountAdmin();
  if (!gate.ok) return gate;
  const { actor } = gate;
  const loaded = await loadTarget(actor, userId, "suspend");
  if (!loaded.ok) return loaded;
  const { target } = loaded;
  if (!isUuid(contactId) || !(await isActiveAdmin(contactId))) {
    return { ok: false, error: "accounts.errContact" };
  }
  if (target.role === "admin" && target.status === "active") {
    const admins = await listActiveAdmins();
    if (removesLastAdmin({ targetIsActiveAdmin: true, activeAdmins: admins.length })) {
      return { ok: false, error: "accounts.errLastAdmin" };
    }
  }

  const { error } = await createServiceClient()
    .from("analysts")
    .update({
      disabled_at: new Date().toISOString(),
      suspended_by: actor.userId,
      suspension_contact_id: contactId,
    })
    .eq("user_id", userId);
  if (error) return { ok: false, error: dbErrorKey(error) };

  await logAudit({
    requestId: null,
    orgId: target.orgId,
    actor: actor.email,
    actorUserId: actor.userId,
    action: "account_suspended",
    metadata: { targetUserId: userId, targetEmail: target.email, contactId },
  });
  if (target.role === "admin") {
    await sendAlert(`[KYB] Admin suspendido: ${target.email}`, [
      `${actor.email} suspendió la cuenta de administración ${target.email}.`,
    ]);
  }
  revalidateAccounts(userId);
  return { ok: true };
}

/** Reactiva una cuenta. Si es de un admin, pide la contraseña de quien actúa. */
export async function reactivateAccountAction(
  userId: string,
  stepUpPassword?: string,
): Promise<AccountResult> {
  const gate = await accountAdmin();
  if (!gate.ok) return gate;
  const { actor } = gate;
  const loaded = await loadTarget(actor, userId, "reactivate");
  if (!loaded.ok) return loaded;
  const { target } = loaded;
  if (target.role === "admin") {
    const err = await stepUp(actor, stepUpPassword);
    if (err) return { ok: false, error: err };
  }

  const { error } = await createServiceClient()
    .from("analysts")
    .update({ disabled_at: null, suspended_by: null, suspension_contact_id: null })
    .eq("user_id", userId);
  if (error) return { ok: false, error: dbErrorKey(error) };

  await logAudit({
    requestId: null,
    orgId: target.orgId,
    actor: actor.email,
    actorUserId: actor.userId,
    action: "account_reactivated",
    metadata: { targetUserId: userId, targetEmail: target.email },
  });
  if (target.role === "admin") {
    await sendAlert(`[KYB] Admin reactivado: ${target.email}`, [
      `${actor.email} reactivó la cuenta de administración ${target.email}.`,
    ]);
  }
  revalidateAccounts(userId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Organizaciones
// ---------------------------------------------------------------------------

/** Crea una org. El slug sale del nombre y no cambia después. */
export async function createOrgAction(name: string): Promise<AccountResult> {
  const gate = await accountAdmin();
  if (!gate.ok) return gate;
  const { actor } = gate;
  const clean = normalizeOrgName(name);
  if (clean.length < 2) return { ok: false, error: "accounts.errOrgName" };

  const supabase = createServiceClient();
  const { data: existing } = await supabase.from("organizations").select("slug");
  const slug = uniqueSlug(slugify(clean), new Set((existing ?? []).map((o) => o.slug as string)));
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: clean, slug })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbErrorKey(error) };

  await logAudit({
    requestId: null,
    orgId: data.id as string,
    actor: actor.email,
    actorUserId: actor.userId,
    action: "org_created",
    metadata: { name: clean, slug },
  });
  revalidateAccounts();
  return { ok: true };
}

export async function renameOrgAction(orgId: string, name: string): Promise<AccountResult> {
  const gate = await accountAdmin();
  if (!gate.ok) return gate;
  const { actor } = gate;
  if (!isUuid(orgId)) return { ok: false, error: "accounts.errNotFound" };
  const clean = normalizeOrgName(name);
  if (clean.length < 2) return { ok: false, error: "accounts.errOrgName" };

  const { data, error } = await createServiceClient()
    .from("organizations")
    .update({ name: clean })
    .eq("id", orgId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (!data?.length) return { ok: false, error: "accounts.errNotFound" };

  await logAudit({
    requestId: null,
    orgId,
    actor: actor.email,
    actorUserId: actor.userId,
    action: "org_renamed",
    metadata: { name: clean },
  });
  revalidateAccounts();
  return { ok: true };
}

/**
 * Suspende una org entera: sus miembros no entran al panel (ven el contacto),
 * su API responde 403 y sus formularios públicos dejan de recibir solicitudes.
 */
export async function suspendOrgAction(orgId: string, contactId: string): Promise<AccountResult> {
  const gate = await accountAdmin();
  if (!gate.ok) return gate;
  const { actor } = gate;
  if (!isUuid(orgId)) return { ok: false, error: "accounts.errNotFound" };
  if (!isUuid(contactId) || !(await isActiveAdmin(contactId))) {
    return { ok: false, error: "accounts.errContact" };
  }
  const org = (await listOrgSummaries()).find((o) => o.id === orgId);
  if (!org) return { ok: false, error: "accounts.errNotFound" };
  const guard = canSuspendOrg({ activeAdminsInOrg: org.activeAdmins, suspended: Boolean(org.suspendedAt) });
  if (guard) {
    return {
      ok: false,
      error: guard === "orgHasAdmins" ? "accounts.errOrgHasAdmins" : "accounts.errAlreadySuspended",
    };
  }

  const { error } = await createServiceClient()
    .from("organizations")
    .update({
      disabled_at: new Date().toISOString(),
      suspended_by: actor.userId,
      suspension_contact_id: contactId,
    })
    .eq("id", orgId);
  if (error) return { ok: false, error: dbErrorKey(error) };

  await logAudit({
    requestId: null,
    orgId,
    actor: actor.email,
    actorUserId: actor.userId,
    action: "org_suspended",
    metadata: { contactId },
  });
  await sendAlert(`[KYB] Organización suspendida: ${org.name}`, [
    `${actor.email} suspendió la organización ${org.name} (${org.slug}).`,
    "Sus usuarios no entran al panel y su API responde 403.",
  ]);
  revalidateAccounts();
  return { ok: true };
}

export async function reactivateOrgAction(orgId: string): Promise<AccountResult> {
  const gate = await accountAdmin();
  if (!gate.ok) return gate;
  const { actor } = gate;
  if (!isUuid(orgId)) return { ok: false, error: "accounts.errNotFound" };

  const { data, error } = await createServiceClient()
    .from("organizations")
    .update({ disabled_at: null, suspended_by: null, suspension_contact_id: null })
    .eq("id", orgId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (!data?.length) return { ok: false, error: "accounts.errNotFound" };

  await logAudit({
    requestId: null,
    orgId,
    actor: actor.email,
    actorUserId: actor.userId,
    action: "org_reactivated",
  });
  revalidateAccounts();
  return { ok: true };
}

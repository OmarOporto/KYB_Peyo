// Provisión de organizaciones y usuarios del panel (no hay registro abierto).
//
// Uso:
//   node scripts/provision-users.mjs apply [--file <ruta>] [--dry-run]
//   node scripts/provision-users.mjs disable <email>      # baja lógica (ban + disabled_at)
//   node scripts/provision-users.mjs enable <email>
//   node scripts/provision-users.mjs reset-mfa <email>    # borra sus factores 2FA
//   node scripts/provision-users.mjs recovery-link <email> # imprime un link para definir contraseña
//
// El archivo por defecto es scripts/provision/users.json (gitignored: tiene
// emails y nombres). Ver scripts/provision/users.example.json.
//
// Local vs remoto: por defecto solo corre contra un Supabase LOCAL. Para
// producción hacen falta las dos cosas: `--remote --yes` y
// PROVISION_ALLOW_REMOTE=1. En local los usuarios se crean con la contraseña
// de PROVISION_PASSWORD; en remoto se INVITAN por email (cada persona define
// su contraseña desde el link), así ninguna contraseña pasa por acá.
//
// Nunca borra a nadie: un usuario que decidió solicitudes no se puede borrar
// (kyb_requests.decided_by). Lo que sobra en la base se informa y se deshabilita
// a mano con `disable`.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------- entorno ----------
try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local opcional */
}

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(url);
if (!isLocal) {
  const allowed =
    flag("--remote") && flag("--yes") && process.env.PROVISION_ALLOW_REMOTE === "1";
  if (!allowed) {
    fail(
      `Rechazado: ${url} NO es local.\n` +
        "Para producción: PROVISION_ALLOW_REMOTE=1 y los flags --remote --yes.",
    );
  }
  console.log(`⚠  Operando sobre PRODUCCIÓN: ${url}\n`);
} else {
  console.log(`Operando sobre LOCAL: ${url}\n`);
}

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").trim();
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// ---------- helpers ----------

/** Todos los usuarios de Auth (paginado: listUsers devuelve 50 por página). */
async function allAuthUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

async function authUserByEmail(email) {
  const target = email.trim().toLowerCase();
  return (await allAuthUsers()).find((u) => u.email?.toLowerCase() === target) ?? null;
}

async function requireUser(email) {
  if (!email) fail("Falta el email.");
  const user = await authUserByEmail(email);
  if (!user) fail(`No existe un usuario con email ${email}.`);
  return user;
}

// ---------- comandos ----------

async function apply() {
  const file = option("--file") ?? new URL("./provision/users.json", import.meta.url);
  let spec;
  try {
    spec = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`No se pudo leer ${file}: ${e.message}\nCopiá scripts/provision/users.example.json.`);
  }
  const dry = flag("--dry-run");
  if (dry) console.log("(dry-run: no se escribe nada)\n");

  // Organizaciones, por slug.
  const { data: existingOrgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, slug, name, disabled_at");
  if (orgErr) fail(`organizations: ${orgErr.message}`);
  const orgBySlug = new Map(existingOrgs.map((o) => [o.slug, o]));

  for (const org of spec.organizations ?? []) {
    const current = orgBySlug.get(org.slug);
    if (!current) {
      console.log(`+ org ${org.slug} (${org.name})`);
      if (!dry) {
        const { data, error } = await supabase
          .from("organizations")
          .insert({ slug: org.slug, name: org.name })
          .select("id, slug, name, disabled_at")
          .single();
        if (error) fail(`crear org ${org.slug}: ${error.message}`);
        orgBySlug.set(org.slug, data);
      }
    } else if (current.name !== org.name) {
      console.log(`~ org ${org.slug}: nombre "${current.name}" → "${org.name}"`);
      if (!dry) {
        const { error } = await supabase
          .from("organizations")
          .update({ name: org.name })
          .eq("id", current.id);
        if (error) fail(`renombrar org ${org.slug}: ${error.message}`);
      }
    }
  }

  // Usuarios.
  const authUsers = await allAuthUsers();
  const authByEmail = new Map(authUsers.map((u) => [u.email?.toLowerCase(), u]));
  const { data: analysts, error: anErr } = await supabase
    .from("analysts")
    .select("user_id, email, role, org_id, full_name, disabled_at");
  if (anErr) fail(`analysts: ${anErr.message}`);
  const analystById = new Map(analysts.map((a) => [a.user_id, a]));

  const listed = new Set();
  for (const u of spec.users ?? []) {
    const email = u.email.trim().toLowerCase();
    listed.add(email);
    const org = orgBySlug.get(u.org);
    if (!org && !dry) fail(`El usuario ${email} apunta a la org "${u.org}", que no existe.`);
    const role = u.role === "admin" ? "admin" : "analyst";

    let authUser = authByEmail.get(email);
    if (!authUser) {
      console.log(`+ usuario ${email} (${role}, ${u.org})${isLocal ? "" : " — invitación por email"}`);
      if (dry) continue;
      if (isLocal) {
        const password = process.env.PROVISION_PASSWORD;
        if (!password) fail("Falta PROVISION_PASSWORD para crear usuarios en local.");
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: u.fullName ?? null, locale: u.locale ?? "es" },
        });
        if (error) fail(`crear ${email}: ${error.message}`);
        authUser = data.user;
      } else {
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { full_name: u.fullName ?? null, locale: u.locale ?? "es" },
          redirectTo: `${appUrl}/auth/reset?invite=1`,
        });
        if (error) fail(`invitar ${email}: ${error.message}`);
        authUser = data.user;
      }
    }

    const current = analystById.get(authUser.id);
    const wanted = {
      user_id: authUser.id,
      email,
      role,
      org_id: org?.id,
      full_name: u.fullName ?? current?.full_name ?? null,
    };
    if (!current) {
      if (authByEmail.has(email)) console.log(`+ analista ${email} (${role}, ${u.org})`);
    } else {
      const changes = [];
      if (current.role !== role) changes.push(`rol ${current.role} → ${role}`);
      if (current.org_id !== org?.id) changes.push(`org → ${u.org}`);
      if ((current.full_name ?? null) !== wanted.full_name) changes.push("nombre");
      if (changes.length) console.log(`~ ${email}: ${changes.join(", ")}`);
    }
    if (!dry) {
      const { error } = await supabase
        .from("analysts")
        .upsert(wanted, { onConflict: "user_id" });
      if (error) fail(`analista ${email}: ${error.message}`);
    }
  }

  // Lo que está en la base y no en el archivo: se informa, no se toca.
  for (const a of analysts) {
    if (!listed.has(a.email.toLowerCase()) && !a.disabled_at) {
      console.log(`? ${a.email} está en la base pero no en el archivo (usar "disable" si corresponde)`);
    }
  }
  console.log("\nListo.");
}

async function setDisabled(email, disabled) {
  const user = await requireUser(email);
  const { error: banErr } = await supabase.auth.admin.updateUserById(user.id, {
    // ~100 años: Supabase no tiene "ban para siempre". "none" lo levanta.
    ban_duration: disabled ? "876000h" : "none",
  });
  if (banErr) fail(`ban ${email}: ${banErr.message}`);
  // disabled_at corta también la RLS al instante; el ban solo impide renovar
  // la sesión, y un token ya emitido sigue valiendo hasta que vence (1 h).
  const { error } = await supabase
    .from("analysts")
    .update({ disabled_at: disabled ? new Date().toISOString() : null })
    .eq("user_id", user.id);
  if (error) fail(`analista ${email}: ${error.message}`);
  console.log(`${disabled ? "Deshabilitado" : "Habilitado"}: ${email}`);
}

async function resetMfa(email) {
  const user = await requireUser(email);
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: user.id });
  if (error) fail(`listFactors: ${error.message}`);
  const factors = data?.factors ?? [];
  if (!factors.length) return console.log(`${email} no tiene factores 2FA.`);
  for (const f of factors) {
    const { error: delErr } = await supabase.auth.admin.mfa.deleteFactor({
      id: f.id,
      userId: user.id,
    });
    if (delErr) fail(`deleteFactor ${f.id}: ${delErr.message}`);
  }
  console.log(`Borrados ${factors.length} factor(es) 2FA de ${email}. Puede volver a activarlo en Seguridad.`);
}

async function recoveryLink(email) {
  await requireUser(email);
  const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email });
  if (error) fail(`generateLink: ${error.message}`);
  const tokenHash = data.properties?.hashed_token;
  console.log(
    "Link para definir contraseña (es un secreto: mandalo solo a esa persona; vence en 1 h):\n" +
      `${appUrl}/auth/confirm?token_hash=${tokenHash}&type=recovery`,
  );
}

switch (command) {
  case "apply":
    await apply();
    break;
  case "disable":
    await setDisabled(args[1], true);
    break;
  case "enable":
    await setDisabled(args[1], false);
    break;
  case "reset-mfa":
    await resetMfa(args[1]);
    break;
  case "recovery-link":
    await recoveryLink(args[1]);
    break;
  default:
    fail(
      "Comandos: apply [--file <ruta>] [--dry-run] | disable <email> | enable <email> | " +
        "reset-mfa <email> | recovery-link <email>",
    );
}

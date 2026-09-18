// Crea (o asegura) el analista de prueba usando la Auth Admin API.
// Uso:  SEED_ADMIN_PASSWORD='...' node scripts/seed-admin.mjs
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno
// (o en .env.local; este script los lee de process.env).
// Solo corre contra un Supabase local salvo SEED_ADMIN_ALLOW_REMOTE=1.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Carga simple de .env.local si las vars no están en el entorno.
try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local opcional */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Este script crea un analista con rol `admin`. Dos guardas para que no pueda
// dejar una cuenta con contraseña conocida en un entorno real:
//
// 1. Solo corre contra un Supabase local. Apuntar a un proyecto remoto es casi
//    siempre un error de copiar y pegar el .env equivocado.
// 2. La contraseña se pasa por entorno; ya no hay una por defecto en el código.
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(url);
if (!isLocal && process.env.SEED_ADMIN_ALLOW_REMOTE !== "1") {
  console.error(
    `Rechazado: ${url} no es local.\n` +
      "Si de verdad quieres sembrar ahí, exporta SEED_ADMIN_ALLOW_REMOTE=1.",
  );
  process.exit(1);
}

const email = process.env.SEED_ADMIN_EMAIL ?? "analyst@kyb.local";
const password = process.env.SEED_ADMIN_PASSWORD;
if (!password) {
  console.error(
    "Falta SEED_ADMIN_PASSWORD.\n" +
      "Ejemplo:  SEED_ADMIN_PASSWORD='...' npm run seed:admin",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Crea el usuario (idempotente: ignora "already registered").
const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

let userId = created?.user?.id;

if (createErr) {
  if (!/already|registered|exists/i.test(createErr.message)) {
    console.error("Error creando usuario:", createErr.message);
    process.exit(1);
  }
  // Ya existe: buscar su id.
  const { data: list } = await supabase.auth.admin.listUsers();
  userId = list?.users?.find((u) => u.email === email)?.id;
}

if (!userId) {
  console.error("No se pudo resolver el id del analista.");
  process.exit(1);
}

const { error: upsertErr } = await supabase
  .from("analysts")
  .upsert({ user_id: userId, email, role: "admin" }, { onConflict: "user_id" });

if (upsertErr) {
  console.error("Error insertando en analysts:", upsertErr.message);
  process.exit(1);
}

console.log(`OK  analista listo: ${email} (contraseña: la de SEED_ADMIN_PASSWORD)`);

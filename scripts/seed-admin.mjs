// Crea (o asegura) el analista de prueba usando la Auth Admin API.
// Uso:  node scripts/seed-admin.mjs
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno
// (o en .env.local; este script los lee de process.env).
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

const email = "analyst@kyb.local";
const password = "password123";

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

console.log(`OK  analista listo: ${email} / ${password}`);

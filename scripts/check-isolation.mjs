// Chequeo de aislamiento por organización, contra un Supabase LOCAL.
//
// Entra como cada usuario con la anon key (lo mismo que puede hacer cualquiera
// desde el navegador, porque esa key es pública) y cuenta cuántas filas de cada
// tabla ve por PostgREST. Sirve para confirmar que la RLS de
// 0025_organizations.sql no deja ver datos de otra org.
//
// Uso: CHECK_PASSWORD='...' node scripts/check-isolation.mjs email1 email2 ...
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local opcional */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.CHECK_PASSWORD;
const emails = process.argv.slice(2);

if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url ?? "")) {
  console.error(`Solo contra un Supabase local (NEXT_PUBLIC_SUPABASE_URL=${url}).`);
  process.exit(1);
}
if (!anon || !password || emails.length === 0) {
  console.error("Uso: CHECK_PASSWORD='...' node scripts/check-isolation.mjs email1 [email2 ...]");
  process.exit(1);
}

const TABLES = [
  "organizations",
  "analysts",
  "kyb_requests",
  "kyb_form_responses",
  "kyb_documents",
  "aml_checks",
  "answer_translations",
  "forms",
  "ai_usage",
  "ai_model_prices",
  "audit_log",
  "webhook_deliveries",
  "api_keys",
  "webhook_endpoints",
  "didit_usage",
];

const rows = [];
for (const email of emails) {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({
    email,
    password,
    // Con captcha activo en local (clave de prueba de Cloudflare) cualquier
    // token pasa; sin captcha, se ignora.
    options: { captchaToken: "XXXX.DUMMY.TOKEN.XXXX" },
  });
  if (error) {
    console.error(`${email}: no pudo entrar (${error.message})`);
    continue;
  }
  const row = { email };
  for (const table of TABLES) {
    const { count, error: qErr } = await sb
      .from(table)
      .select("*", { count: "exact", head: true });
    row[table] = qErr ? `err` : count;
  }
  rows.push(row);
  await sb.auth.signOut();
}
console.table(rows);

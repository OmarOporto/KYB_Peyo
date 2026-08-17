// Evalúa la calidad del glosario contra un corpus con respuesta conocida.
//
// Los presets (lib/forms/presets/*.ts) tienen pares ES/EN escritos a mano: son
// la referencia de cómo hablamos. Este script traduce los ES con el proveedor
// configurado y los compara contra los EN reales. Si tocás
// lib/i18n-ai/glossary.ts, corré esto antes de darlo por bueno.
//
// Uso:
//   TRANSLATE_PROVIDER=openai OPENAI_API_KEY=... node scripts/i18n-eval.mjs
//   node scripts/i18n-eval.mjs --limit 30      (submuestra, para iterar barato)
//
// Salida: % de coincidencia exacta, % normalizada, y los diffs para revisar a
// ojo. La coincidencia exacta NO es el objetivo (hay varias traducciones
// válidas): los diffs son lo que hay que leer.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PRESETS_DIR = join(ROOT, "lib", "forms", "presets");
const ENV_FILE = join(ROOT, ".env.local");

// ---------- .env.local (el script corre fuera de Next) ----------
try {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
} catch {
  // Sin .env.local: se usa lo que venga del entorno.
}

// ---------- Corpus: pares {es, en} de los presets ----------
function loadPairs() {
  const pairs = new Map();
  for (const file of readdirSync(PRESETS_DIR)) {
    if (!file.endsWith(".ts") || file === "index.ts") continue;
    const src = readFileSync(join(PRESETS_DIR, file), "utf8");
    const re = /es:\s*"((?:[^"\\]|\\.)*)"\s*,\s*\n?\s*en:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(src))) {
      const es = m[1].replace(/\\"/g, '"');
      const en = m[2].replace(/\\"/g, '"');
      if (es.trim() && en.trim() && !pairs.has(es)) pairs.set(es, en);
    }
  }
  return [...pairs].map(([es, en], i) => ({ id: `p${i}`, es, en }));
}

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  let pairs = loadPairs();
  if (Number.isFinite(limit)) pairs = pairs.slice(0, limit);
  if (!pairs.length) {
    console.error("No se encontraron pares es/en en lib/forms/presets/.");
    process.exit(1);
  }

  const provider = process.env.TRANSLATE_PROVIDER ?? "mock";
  console.log(`corpus: ${pairs.length} pares · proveedor: ${provider}`);
  if (provider !== "openai") {
    console.log(
      "\nAviso: con el proveedor `mock` esto no mide calidad (no traduce).\n" +
        "Corré con TRANSLATE_PROVIDER=openai para una medición real.\n",
    );
  }

  const results = await translate(pairs, systemPrompt("es", "en"), provider);

  let exact = 0;
  let loose = 0;
  const diffs = [];
  for (const p of pairs) {
    const got = results.get(p.id) ?? "";
    if (got === p.en) exact++;
    else if (normalize(got) === normalize(p.en)) loose++;
    else diffs.push({ es: p.es, expected: p.en, got });
  }

  const pct = (n) => `${Math.round((n / pairs.length) * 100)}%`;
  console.log(`\nexacta:      ${exact}/${pairs.length} (${pct(exact)})`);
  console.log(`normalizada: ${exact + loose}/${pairs.length} (${pct(exact + loose)})`);
  console.log(`diferencias: ${diffs.length}`);

  if (diffs.length) {
    console.log("\n--- DIFERENCIAS (leer a ojo: varias pueden ser válidas) ---");
    for (const d of diffs) {
      console.log(`\n  ES        ${d.es}`);
      console.log(`  esperado  ${d.expected}`);
      console.log(`  obtenido  ${d.got || "(sin respuesta)"}`);
    }
  }
}

/**
 * Reconstruye el prompt de sistema desde glossary.json — el MISMO archivo que
 * usa lib/i18n-ai/glossary.ts, así el eval mide lo que corre en producción.
 */
function systemPrompt(from, to) {
  const data = JSON.parse(
    readFileSync(join(ROOT, "lib", "i18n-ai", "glossary.json"), "utf8"),
  );
  const lines = [
    `Traducís textos de un formulario de onboarding empresarial (KYB/AML) de ${from} a ${to}.`,
    "",
    "REGLAS DE ESTILO:",
    ...data.styleRules.map((r) => `- ${r}`),
  ];
  const terms = data.terms?.[from]?.[to];
  if (terms) {
    lines.push("");
    lines.push(
      "GLOSARIO OBLIGATORIO (término origen => traducción canónica). Usá estas " +
        "equivalencias siempre que el término aparezca, ajustando número y " +
        "concordancia al contexto:",
    );
    for (const [src, dst] of Object.entries(terms)) lines.push(`- ${src} => ${dst}`);
  }
  lines.push("", "CONTRATO DE SALIDA:", ...data.outputContract.map((l) => `- ${l}`));
  return lines.join("\n");
}

async function translate(pairs, sysPrompt, provider) {
  const out = new Map();
  if (provider !== "openai") {
    for (const p of pairs) out.set(p.id, `«en» ${p.es}`);
    return out;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Falta OPENAI_API_KEY.");
    process.exit(1);
  }
  const model = process.env.OPENAI_TRANSLATE_MODEL ?? "gpt-4.1";

  // Mismos lotes de 80 que usa el motor, para medir en las mismas condiciones.
  for (let i = 0; i < pairs.length; i += 80) {
    const batch = pairs.slice(i, i + 80);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: sysPrompt },
          {
            role: "user",
            content: JSON.stringify({
              items: batch.map((p) => ({ id: p.id, text: p.es })),
            }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "translations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      text: { type: "string" },
                      keepSource: { type: "boolean" },
                    },
                    required: ["id", "text", "keepSource"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["items"],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!res.ok) {
      console.error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    for (const it of parsed.items ?? []) {
      if (typeof it?.id === "string" && typeof it?.text === "string") {
        out.set(it.id, it.text);
      }
    }
    process.stdout.write(`  lote ${i / 80 + 1}: ${out.size}/${pairs.length}\r`);
  }
  process.stdout.write("\n");
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

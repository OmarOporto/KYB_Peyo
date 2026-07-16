// Transforma un export nativo de formulario (FormDefinition, version:1) a bilingüe
// (ES/EN) e inyecta placeholders contextuales, preservando keys/values/ramificación.
//
// Uso:
//   node scripts/translate-form.mjs extract   -> vuelca cadenas únicas y campos de texto
//   node scripts/translate-form.mjs build      -> zip _strings.json + _en.json -> translations.es-en.json
//   node scripts/translate-form.mjs [ruta]     -> aplica traducciones + placeholders (default)
//
// El contenido (traducciones y placeholders) vive en scripts/form-i18n/*.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_DIR = join(__dirname, "form-i18n");
const SRC_DEFAULT =
  "C:/Users/MSI KATANA/Downloads/FORMULARIO DE REGISTRO PARA EMPRESAS (1).json";
const STRINGS = join(I18N_DIR, "_strings.json");
const EN = join(I18N_DIR, "_en.json");
const TEXTFIELDS = join(I18N_DIR, "_textfields.json");
const TRANSLATIONS = join(I18N_DIR, "translations.es-en.json");
const PLACEHOLDERS = join(I18N_DIR, "placeholders.json");
const OUT = join(I18N_DIR, "formulario-empresas.bilingue.json");

const TEXT_TYPES = new Set(["short_text", "long_text", "email", "number"]);

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const ensureDir = () => {
  if (!existsSync(I18N_DIR)) mkdirSync(I18N_DIR, { recursive: true });
};
// Texto de display en ES (los strings planos del fuente ya son ES).
const asEs = (v) =>
  v == null ? "" : typeof v === "string" ? v : (v.es ?? Object.values(v)[0] ?? "");

const arg = process.argv[2];
const mode = arg === "extract" ? "extract" : arg === "build" ? "build" : "apply";

// ---------- BUILD: zip _strings.json + _en.json -> translations.es-en.json ----------
if (mode === "build") {
  const es = readJson(STRINGS);
  const en = readJson(EN);
  if (es.length !== en.length) {
    console.error(`length mismatch: _strings=${es.length} _en=${en.length}`);
    process.exit(1);
  }
  // null en el array EN => nombre propio: se mantiene el español (identidad).
  const map = {};
  es.forEach((s, i) => (map[s] = en[i] == null ? s : en[i]));
  ensureDir();
  writeFileSync(TRANSLATIONS, JSON.stringify(map, null, 2));
  console.log(`build -> ${TRANSLATIONS} (${es.length} pares)`);
  process.exit(0);
}

const srcPath = arg && mode === "apply" ? arg : SRC_DEFAULT;
const def = readJson(srcPath);

// ---------- EXTRACT ----------
if (mode === "extract") {
  const strings = new Set();
  const textFields = [];
  const push = (v) => {
    const s = asEs(v);
    if (s.trim()) strings.add(s);
  };
  push(def.title);
  for (const s of def.sections ?? []) {
    push(s.title);
    if (s.description) push(s.description);
    for (const f of s.fields ?? []) {
      push(f.label);
      if (f.help) push(f.help);
      for (const o of f.options ?? []) push(o.label);
      if (TEXT_TYPES.has(f.type))
        textFields.push({ key: f.key, type: f.type, label: asEs(f.label) });
    }
  }
  ensureDir();
  const strArr = [...strings];
  writeFileSync(STRINGS, JSON.stringify(strArr, null, 2));
  writeFileSync(TEXTFIELDS, JSON.stringify(textFields, null, 2));
  console.log(`extract -> ${strArr.length} cadenas únicas, ${textFields.length} campos de texto`);
  console.log(`  ${STRINGS}\n  ${TEXTFIELDS}`);
  process.exit(0);
}

// ---------- APPLY ----------
const tmap = readJson(TRANSLATIONS);
const pmap = readJson(PLACEHOLDERS); // keyed by ES label

const missing = new Set();
const missingPh = [];
let wrapped = 0;
let placeholders = 0;

// Envuelve un string ES en {es,en}. Si ya es objeto lo deja. Si falta traducción,
// conserva el ES y registra la cadena en `missing`.
function wrap(v) {
  if (v == null || typeof v === "object") return v;
  if (!v.trim()) return v;
  const en = tmap[v];
  if (en == null) {
    missing.add(v);
    return v;
  }
  wrapped++;
  return { es: v, en };
}

def.title = wrap(def.title);
for (const s of def.sections ?? []) {
  s.title = wrap(s.title);
  if (s.description) s.description = wrap(s.description);
  for (const f of s.fields ?? []) {
    const esLabel = asEs(f.label); // antes de envolver
    f.label = wrap(f.label);
    if (f.help) f.help = wrap(f.help);
    for (const o of f.options ?? []) o.label = wrap(o.label);
    if (TEXT_TYPES.has(f.type)) {
      const ph = pmap[esLabel];
      if (ph && ph.es && ph.en) {
        f.placeholder = { es: ph.es, en: ph.en };
        placeholders++;
      } else {
        missingPh.push({ key: f.key, label: esLabel });
      }
    }
  }
}

ensureDir();
writeFileSync(OUT, JSON.stringify(def, null, 2));

console.log("apply -> " + OUT);
console.log(`  textos envueltos {es,en}: ${wrapped}`);
console.log(`  placeholders añadidos:    ${placeholders}`);
console.log(`  cadenas SIN traducción:   ${missing.size}`);
console.log(`  campos SIN placeholder:   ${missingPh.length}`);
if (missing.size) {
  console.log("\n--- MISSING translations ---");
  for (const m of missing) console.log("  · " + m);
}
if (missingPh.length) {
  console.log("\n--- MISSING placeholders (label) ---");
  const seen = new Set();
  for (const m of missingPh)
    if (!seen.has(m.label)) (seen.add(m.label), console.log("  · " + m.label));
}
process.exit(missing.size || missingPh.length ? 1 : 0);

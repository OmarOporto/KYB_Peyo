// Extrae los questionnaires (formularios) de DIDIT vía Management API y los
// vuelca a JSON. Alcance: solo extracción para revisión — no toca la app.
//
// Uso:
//   npm run didit:pull                       # lista todo + retrieve de cada grupo publicado
//   node scripts/didit-pull.mjs --uuid=<id>  # solo ese questionnaire
//   node scripts/didit-pull.mjs --list-only  # solo el inventario
//
// Requiere en .env.local (o entorno):
//   DIDIT_API_URL=https://verification.didit.me   (default)
//   DIDIT_API_KEY=<tu x-api-key>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// ---------- carga de .env.local (mismo patrón que seed-admin.mjs) ----------
try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local opcional */
}

// ---------- args ----------
const args = process.argv.slice(2);
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
};
const hasFlag = (name) => args.includes(`--${name}`);

const BASE = (process.env.DIDIT_API_URL || "https://verification.didit.me").replace(/\/+$/, "");
const API_KEY = process.env.DIDIT_API_KEY;
const ONLY_UUID = getArg("uuid") || process.env.DIDIT_QUESTIONNAIRE_UUID;
const LIST_ONLY = hasFlag("list-only");
const OUT_DIR = new URL("../didit/", import.meta.url);

if (!API_KEY) {
  console.error("Falta DIDIT_API_KEY (ponla en .env.local). Abortando.");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const outPath = (name) => new URL(name, OUT_DIR);

// ---------- fetch con manejo de errores ----------
async function diditGet(path, { retries = 2 } = {}) {
  const url = `${BASE}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "x-api-key": API_KEY, accept: "application/json" } });
    if (res.status === 429 && attempt < retries) {
      const wait = 1500 * (attempt + 1);
      console.warn(`  429 rate limit en ${path} — reintentando en ${wait}ms…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const body = await res.text();
    let json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      /* respuesta no-JSON */
    }
    return { ok: res.ok, status: res.status, json, body };
  }
}

// ---------- helpers de normalización (forma del retrieve no documentada) ----------
const pick = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null) return obj[k];
  return undefined;
};

const LABEL_KEYS = ["label", "title", "text", "question", "name", "prompt"];
const TYPE_KEYS = ["type", "question_type", "element_type", "kind"];
const ID_KEYS = ["id", "uuid", "question_id", "key", "ref"];
const OPTION_KEYS = ["options", "choices", "answers", "values", "items"];
const REQUIRED_KEYS = ["required", "is_required", "mandatory"];

function looksLikeQuestion(o) {
  return (
    o && typeof o === "object" && !Array.isArray(o) &&
    LABEL_KEYS.some((k) => typeof o[k] === "string") &&
    TYPE_KEYS.some((k) => o[k] != null)
  );
}

// Recorre el objeto crudo y recolecta cualquier cosa que parezca una pregunta.
function harvestQuestions(node, sectionTitle, acc) {
  if (Array.isArray(node)) {
    for (const item of node) harvestQuestions(item, sectionTitle, acc);
    return;
  }
  if (!node || typeof node !== "object") return;

  const title = pick(node, ["section", "section_title", "page_title", "group", "title"]);
  const nextSection = looksLikeQuestion(node) ? sectionTitle : (title ?? sectionTitle);

  if (looksLikeQuestion(node)) {
    const opts = pick(node, OPTION_KEYS);
    acc.push({
      id: pick(node, ID_KEYS) ?? null,
      label: pick(node, LABEL_KEYS) ?? null,
      type: pick(node, TYPE_KEYS) ?? null,
      required: Boolean(pick(node, REQUIRED_KEYS)) || undefined,
      options: Array.isArray(opts)
        ? opts.map((o) =>
            typeof o === "string" ? o : pick(o, LABEL_KEYS) ?? pick(o, ["value"]) ?? o,
          )
        : undefined,
      section: sectionTitle ?? null,
      _rawKeys: Object.keys(node),
    });
  }

  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === "object") harvestQuestions(v, nextSection, acc);
  }
}

function normalize(meta, raw) {
  const flat = [];
  harvestQuestions(raw, null, flat);
  const gaps = [];
  if (flat.length === 0)
    gaps.push("No se detectaron preguntas automáticamente — revisar el .raw.json y ajustar el normalizador.");
  const missingLabels = flat.filter((q) => !q.label).length;
  const missingIds = flat.filter((q) => !q.id).length;
  if (missingLabels) gaps.push(`${missingLabels} preguntas sin etiqueta detectada.`);
  if (missingIds) gaps.push(`${missingIds} preguntas sin id detectado.`);

  // Agrupa por sección conservando orden.
  const sectionsMap = new Map();
  for (const q of flat) {
    const key = q.section ?? "(sin sección)";
    if (!sectionsMap.has(key)) sectionsMap.set(key, []);
    sectionsMap.get(key).push({
      id: q.id, label: q.label, type: q.type,
      required: q.required, options: q.options,
    });
  }

  return {
    source: {
      host: BASE,
      uuid: meta?.uuid ?? null,
      questionnaireGroupId: meta?.questionnaire_group_id ?? null,
      title: meta?.title ?? null,
      version: meta?.version ?? null,
      languages: meta?.languages ?? null,
      defaultLanguage: meta?.default_language ?? null,
      status: meta?.status ?? null,
    },
    sections: [...sectionsMap.entries()].map(([title, questions]) => ({ title, questions })),
    flatQuestions: flat.map(({ _rawKeys, ...q }) => q),
    gaps,
  };
}

// ---------- cosecha desde una sesión completada (fallback de etiquetas) ----------
function harvestFromSample() {
  try {
    const raw = readFileSync(outPath("sample-decision.json"), "utf8");
    const data = JSON.parse(raw);
    const map = {};
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      if (n.question_id && n.question_label) map[n.question_id] = n.question_label;
      Object.values(n).forEach(walk);
    };
    walk(data);
    const count = Object.keys(map).length;
    if (count) {
      writeFileSync(outPath("labels-from-responses.json"), JSON.stringify(map, null, 2));
      console.log(`Cosechadas ${count} etiquetas desde sample-decision.json → didit/labels-from-responses.json`);
    }
    return map;
  } catch {
    return null;
  }
}

// ---------- main ----------
console.log(`DIDIT pull — host: ${BASE}`);

async function listAll() {
  const all = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const r = await diditGet(`/v3/questionnaires/?limit=${limit}&offset=${offset}`);
    if (!r.ok) {
      console.error(`Error listando (${r.status}): ${r.body?.slice(0, 300)}`);
      if (r.status === 403) console.error("→ API key inválida/expirada o sin permisos.");
      process.exit(1);
    }
    const results = r.json?.results ?? [];
    all.push(...results);
    const total = r.json?.count ?? all.length;
    offset += limit;
    if (all.length >= total || results.length === 0) break;
  }
  return all;
}

let targets = [];
let listRaw = null;

if (ONLY_UUID) {
  targets = [{ uuid: ONLY_UUID }];
} else {
  const list = await listAll();
  listRaw = list;
  writeFileSync(outPath("questionnaires.list.json"), JSON.stringify(list, null, 2));
  console.log(`\nInventario (${list.length} versiones):`);
  for (const q of list) {
    console.log(
      `  • ${q.title ?? "(sin título)"}  v${q.version ?? "?"}  [${q.status ?? "?"}]  ` +
        `uuid=${q.uuid}  tipos=${(q.question_types ?? []).join(",") || "?"}`,
    );
  }

  // Un target por grupo publicado, versión más alta.
  const byGroup = new Map();
  for (const q of list) {
    if (q.status && q.status !== "published") continue;
    const g = q.questionnaire_group_id ?? q.uuid;
    const cur = byGroup.get(g);
    if (!cur || (q.version ?? 0) > (cur.version ?? 0)) byGroup.set(g, q);
  }
  targets = [...byGroup.values()];
  if (targets.length === 0 && list.length) targets = [list[0]]; // fallback: el primero
}

harvestFromSample();

if (LIST_ONLY) {
  console.log("\n--list-only: no se hace retrieve. Fin.");
  process.exit(0);
}

console.log(`\nRetrieve de ${targets.length} questionnaire(s)…`);
const normalizedAll = [];
for (const t of targets) {
  const uuid = t.uuid;
  const r = await diditGet(`/v3/questionnaires/${uuid}/`);
  if (!r.ok) {
    console.warn(`  ✗ ${uuid} → ${r.status}. ${r.status === 404 ? "Retrieve no disponible; usa sample-decision.json." : r.body?.slice(0, 200)}`);
    continue;
  }
  writeFileSync(outPath(`questionnaire.${uuid}.raw.json`), JSON.stringify(r.json, null, 2));
  const meta = { ...t, ...(r.json?.uuid ? r.json : {}) };
  const norm = normalize(meta, r.json);
  normalizedAll.push(norm);
  console.log(
    `  ✓ ${uuid} → ${norm.flatQuestions.length} preguntas, ${norm.sections.length} secciones` +
      (norm.gaps.length ? `  (gaps: ${norm.gaps.length})` : ""),
  );
}

const deliverable = normalizedAll.length === 1 ? normalizedAll[0] : { questionnaires: normalizedAll };
writeFileSync(outPath("questions.normalized.json"), JSON.stringify(deliverable, null, 2));
console.log(`\nEntregable: didit/questions.normalized.json`);
console.log("Revisa también los *.raw.json para ver campos que el normalizador no haya mapeado.");

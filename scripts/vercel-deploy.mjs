// Dispara un deployment en Vercel vía API REST.
//
// Se usa la API y no el CLI (`vercel deploy`) porque el token de este proyecto
// opera sobre el recurso pero NO resuelve a un usuario, y el CLI necesita esa
// identidad para leer la configuración del proyecto ("Could not retrieve
// Project Settings"). La API solo requiere permiso sobre el proyecto.
//
// Frente a un Deploy Hook tiene dos ventajas: fija el COMMIT exacto (el hook
// siempre construye la punta de la rama, que puede haber avanzado) y espera el
// resultado, así un build fallido hace fallar el job.
//
// Uso:
//   node scripts/vercel-deploy.mjs            -> preview del HEAD actual
//   node scripts/vercel-deploy.mjs --prod     -> producción
//   node scripts/vercel-deploy.mjs --prod --sha <commit>
//
// Requiere en el entorno: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.

import { execSync } from "node:child_process";

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM = process.env.VERCEL_ORG_ID;
const PROJECT = process.env.VERCEL_PROJECT_ID;

if (!TOKEN || !TEAM || !PROJECT) {
  console.error("Faltan VERCEL_TOKEN, VERCEL_ORG_ID o VERCEL_PROJECT_ID.");
  process.exit(1);
}

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const shaArg = args[args.indexOf("--sha") + 1];

// En CI el SHA lo da GitHub; en local sale del repo.
const sha =
  (args.includes("--sha") && shaArg) ||
  process.env.GITHUB_SHA ||
  execSync("git rev-parse HEAD").toString().trim();

const auth = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const qs = `teamId=${TEAM}`;

// El repo conectado al proyecto. Se lee del propio proyecto para no hardcodear
// nada que pueda cambiar (rename del repo, transferencia de cuenta).
const projectRes = await fetch(
  `https://api.vercel.com/v9/projects/${PROJECT}?${qs}`,
  { headers: auth },
);
const project = await projectRes.json();
if (!projectRes.ok) {
  console.error("No se pudo leer el proyecto:", JSON.stringify(project, null, 2));
  process.exit(1);
}

const link = project.link ?? {};
const lastMeta = project.latestDeployments?.[0]?.meta ?? {};
const repoId = link.repoId ?? lastMeta.githubRepoId;
const org = link.org ?? lastMeta.githubOrg;
const repo = link.repo ?? lastMeta.githubRepo;

if (!repoId && !(org && repo)) {
  console.error(
    "El proyecto no tiene repositorio Git conectado; la API no puede construir desde un ref.",
  );
  process.exit(1);
}

const gitSource = repoId
  ? { type: "github", repoId: Number(repoId), ref: "main", sha }
  : { type: "github", org, repo, ref: "main", sha };

console.log(
  `Desplegando ${project.name} @ ${sha.slice(0, 7)} → ${prod ? "production" : "preview"}`,
);

const createRes = await fetch(`https://api.vercel.com/v13/deployments?${qs}`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({
    name: project.name,
    project: PROJECT,
    // `target` solo admite 'production' / 'staging' / entorno custom. Un
    // deployment SIN target es un preview, que es el default deseado.
    ...(prod ? { target: "production" } : {}),
    gitSource,
  }),
});
const created = await createRes.json();

if (!createRes.ok) {
  console.error("Error al crear el deployment:", JSON.stringify(created, null, 2));
  process.exit(1);
}

console.log(`Deployment ${created.id}  https://${created.url}`);

// ---- Espera del resultado ----
// Sin esto el job "pasa" aunque el build reviente, que es el defecto del
// Deploy Hook. Se aborta a los 15 min: un build de este proyecto tarda ~1 min.
const DEADLINE = Date.now() + 15 * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let state = created.readyState ?? "QUEUED";

while (!["READY", "ERROR", "CANCELED"].includes(state)) {
  if (Date.now() > DEADLINE) {
    console.error("Timeout esperando el build (15 min).");
    process.exit(1);
  }
  await sleep(5_000);
  const res = await fetch(
    `https://api.vercel.com/v13/deployments/${created.id}?${qs}`,
    { headers: auth },
  );
  const info = await res.json();
  if (!res.ok) {
    console.error("No se pudo consultar el estado:", JSON.stringify(info, null, 2));
    process.exit(1);
  }
  if (info.readyState !== state) {
    state = info.readyState;
    console.log(`  ${state}`);
  }
}

if (state !== "READY") {
  console.error(`El deployment terminó en ${state}.`);
  process.exit(1);
}

console.log(`Listo: https://${created.url}`);

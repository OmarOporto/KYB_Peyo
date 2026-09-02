// Lee los logs de Vercel vía API REST.
//
// Existe por lo mismo que `vercel-deploy.mjs` usa la API en vez del CLI: el
// token de este proyecto opera sobre el recurso pero NO resuelve a un usuario,
// así que `vercel login` (que es por navegador) no es una opción y `vercel logs
// --token=…` falla al intentar leer la configuración del proyecto. La API solo
// pide permiso sobre el proyecto, que es justo lo que el token tiene.
//
// Dos fuentes distintas, que la UI de Vercel muestra en pantallas separadas:
//   - runtime  -> GET /v1/projects/:projectId/deployments/:deploymentId/runtime-logs
//                 Lo que imprime la función en ejecución (console.log/error).
//   - build    -> GET /v3/deployments/:idOrUrl/events?builds=1
//                 La salida de `next build`.
//
// Uso:
//   node scripts/vercel-logs.mjs                     -> runtime del último deployment de producción
//   node scripts/vercel-logs.mjs --build             -> logs de build
//   node scripts/vercel-logs.mjs --deployment <id|url>
//   node scripts/vercel-logs.mjs --level error       -> solo error/fatal
//   node scripts/vercel-logs.mjs --grep report       -> filtra por texto (también en la ruta)
//   node scripts/vercel-logs.mjs --follow            -> se queda escuchando en vivo
//
// Requiere en el entorno: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM = process.env.VERCEL_ORG_ID;
const PROJECT = process.env.VERCEL_PROJECT_ID;

if (!TOKEN || !TEAM || !PROJECT) {
  console.error("Faltan VERCEL_TOKEN, VERCEL_ORG_ID o VERCEL_PROJECT_ID.");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};

const wantBuild = flag("build");
const follow = flag("follow");
const level = value("level");
const grep = value("grep");

const auth = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const qs = `teamId=${TEAM}`;

/** Deployment sobre el que leer: el indicado, o el último de producción. */
async function resolveDeployment() {
  const given = value("deployment");
  if (given) return { id: given, url: given };

  // Se lee del proyecto y no de /v6/deployments porque es la misma llamada que
  // ya hace vercel-deploy.mjs: si el token alcanza para desplegar, alcanza acá.
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJECT}?${qs}`, {
    headers: auth,
  });
  const project = await res.json();
  if (!res.ok) {
    console.error("No se pudo leer el proyecto:", JSON.stringify(project, null, 2));
    process.exit(1);
  }

  const list = project.latestDeployments ?? [];
  const prod = list.find((d) => d.target === "production") ?? list[0];
  if (!prod) {
    console.error("El proyecto no tiene deployments.");
    process.exit(1);
  }
  return { id: prod.id ?? prod.uid, url: prod.url };
}

const ts = (ms) => new Date(Number(ms)).toISOString().slice(11, 23);

function matches(text, entryLevel) {
  if (level && !String(entryLevel ?? "").match(new RegExp(`^(${level})$`, "i"))) {
    // `--level error` incluye fatal: un crash es lo que se suele estar buscando.
    if (!(level === "error" && entryLevel === "fatal")) return false;
  }
  if (grep && !String(text).toLowerCase().includes(grep.toLowerCase())) return false;
  return true;
}

async function runtimeLogs(deployment) {
  const url =
    `https://api.vercel.com/v1/projects/${PROJECT}` +
    `/deployments/${deployment.id}/runtime-logs?${qs}`;

  const res = await fetch(url, { headers: auth });
  if (!res.ok || !res.body) {
    console.error(`Error ${res.status}:`, await res.text());
    process.exit(1);
  }

  // application/stream+json: un objeto JSON por línea, y la conexión queda
  // abierta para los logs en vivo. Se corta en el `delimiter`, que es la marca
  // de "se acabó el histórico", salvo que se pida --follow.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let printed = 0;

  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    buffer += decoder.decode(chunk, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }

      if (e.source === "delimiter") {
        if (follow) {
          console.log("--- histórico completo; escuchando en vivo (Ctrl+C para salir) ---");
          continue;
        }
        await reader.cancel();
        if (printed === 0) console.log("(sin entradas que coincidan)");
        return;
      }

      const path = [e.requestMethod, e.requestPath].filter(Boolean).join(" ");
      const text = [path, e.responseStatusCode, e.message].filter(Boolean).join("  ");
      if (!matches(text, e.level)) continue;

      printed++;
      console.log(
        `${ts(e.timestampInMs)}  ${String(e.level ?? "").padEnd(7)}  ${text}` +
          (e.messageTruncated ? "  …(truncado)" : ""),
      );
    }
  }
  if (printed === 0) console.log("(sin entradas que coincidan)");
}

async function buildLogs(deployment) {
  const url =
    `https://api.vercel.com/v3/deployments/${deployment.id}` +
    `/events?builds=1&limit=-1&direction=forward&${qs}`;

  const res = await fetch(url, { headers: auth });
  const events = await res.json();
  if (!res.ok) {
    console.error("Error al leer los eventos:", JSON.stringify(events, null, 2));
    process.exit(1);
  }

  for (const e of Array.isArray(events) ? events : []) {
    const text = e.text ?? e.payload?.text ?? "";
    if (!text) continue;
    if (!matches(text, e.level)) continue;
    console.log(`${ts(e.created ?? e.date)}  ${String(text).replace(/\n$/, "")}`);
  }
}

const deployment = await resolveDeployment();
console.log(
  `${wantBuild ? "build" : "runtime"} · ${deployment.url ?? deployment.id}${
    level ? ` · level=${level}` : ""
  }${grep ? ` · grep=${grep}` : ""}\n`,
);

if (wantBuild) await buildLogs(deployment);
else await runtimeLogs(deployment);

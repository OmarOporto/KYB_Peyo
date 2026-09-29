import "server-only";
import { env } from "@/lib/env";

// ------------------------------------------------------------
// HTTP hacia DIDIT (host verification.didit.me, auth x-api-key)
// ------------------------------------------------------------
// Compartido por las verificaciones (verify.ts) y el registro de costos
// (costs.ts), que no pueden importarse entre sí sin un ciclo.

export function diditBase(): string {
  return (env.diditApiUrl() || "https://verification.didit.me").replace(/\/+$/, "");
}

export function diditApiKey(): string {
  const k = env.diditApiKey();
  if (!k) throw new Error("DIDIT_API_KEY no configurado");
  return k;
}

/** GET de solo lectura. Lanza si DIDIT no responde 2xx. */
export async function diditGet(path: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const res = await fetch(`${diditBase()}${path}`, {
    headers: { "x-api-key": diditApiKey(), accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`DIDIT GET ${path} ${res.status}`);
  return json;
}

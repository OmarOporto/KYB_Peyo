import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "net";

// --- Clasificación de IPs: rechaza privadas/loopback/link-local/multicast/reservadas ---

function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    const b = Number(part);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = ((n << 8) | b) >>> 0;
  }
  return n >>> 0;
}

function ipv4IsPublic(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const inCidr = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  const blocked: [string, number][] = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10], // CGNAT
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local (incluye 169.254.169.254 metadata)
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reservado
  ];
  return !blocked.some(([base, bits]) => inCidr(base, bits));
}

function ipv6IsPublic(ip: string): boolean {
  const a = ip.toLowerCase();
  if (a === "::1" || a === "::") return false; // loopback / unspecified
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return ipv4IsPublic(mapped[1]);
  const head = a.split(":")[0];
  if (/^f[cd]/.test(head)) return false; // ULA fc00::/7
  if (/^fe[89ab]/.test(head)) return false; // link-local fe80::/10
  if (/^ff/.test(head)) return false; // multicast ff00::/8
  return true;
}

function ipIsPublic(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return ipv4IsPublic(ip);
  if (fam === 6) return ipv6IsPublic(ip);
  return false;
}

/**
 * Valida que la URL sea un destino de webhook seguro: https, puerto 443, y que
 * TODAS las IPs a las que resuelve el host sean públicas (anti-SSRF). Lanza si no.
 * Devuelve la URL parseada.
 */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  if (url.protocol !== "https:") throw new Error("El webhook debe usar https");
  if (url.port && url.port !== "443") throw new Error("Solo se permite el puerto 443");

  const results = await lookup(url.hostname, { all: true });
  if (!results.length) throw new Error("No se pudo resolver el host");
  for (const r of results) {
    if (!ipIsPublic(r.address)) {
      throw new Error(`Destino no permitido (IP privada/reservada): ${r.address}`);
    }
  }
  return url;
}

/**
 * POST seguro a un webhook del cliente: re-resuelve y valida la IP justo antes
 * de conectar (anti DNS-rebinding), no sigue redirects, timeout corto.
 */
export async function safeWebhookFetch(
  rawUrl: string,
  opts: { body: string; headers: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
  await assertPublicHttpsUrl(rawUrl); // valida inmediatamente antes de conectar
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    return await fetch(rawUrl, {
      method: "POST",
      headers: opts.headers,
      body: opts.body,
      redirect: "manual", // no seguir redirects a destinos no validados
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

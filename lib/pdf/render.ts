import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type CookieData } from "puppeteer-core";
import { env } from "@/lib/env";

/**
 * Renderiza una URL de la propia app a PDF con Chromium sin interfaz.
 *
 * Se navega a la página real en vez de re-maquetar el documento: el PDF sale
 * idéntico a lo que el analista ya validó en pantalla y el `@media print` de
 * globals.css sigue siendo la única fuente de verdad de la impresión.
 */

/**
 * Chrome del sistema, para desarrollo. `@sparticuz/chromium` trae un binario de
 * Linux pensado para serverless, así que en una máquina de trabajo se usa el
 * navegador ya instalado.
 */
function localChromePath(): string | null {
  const configured = env.chromePath();
  if (configured) return existsSync(configured) ? configured : null;

  const localAppData = process.env.LOCALAPPDATA ?? "";
  const candidates = [
    // Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    localAppData && path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((p): p is string => Boolean(p));

  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Binario y flags. El Chrome local gana si existe: en serverless no hay ninguno
 * de esos paths, así que allí cae solo al de `@sparticuz/chromium`.
 */
async function launchOptions(): Promise<{ executablePath: string; args: string[] }> {
  const local = localChromePath();
  if (local) return { executablePath: local, args: [] };
  return { executablePath: await chromium.executablePath(), args: chromium.args };
}

export async function renderPdf(
  url: string,
  cookies: CookieData[],
): Promise<Uint8Array> {
  const { executablePath, args } = await launchOptions();

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      args,
      headless: true,
      // Ancho de escritorio: el informe usa `sm:` para las rejillas de dos
      // columnas y con un viewport chico saldría todo apilado.
      defaultViewport: { width: 1280, height: 1696 },
    });

    // A nivel navegador y no `page.setCookie`, que está deprecado en Puppeteer 24.
    if (cookies.length > 0) await browser.setCookie(...cookies);

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });

    // `networkidle0` no garantiza que las imágenes estén decodificadas ni que las
    // fuentes hayan cargado; sin esto el PDF puede salir con huecos o con la
    // tipografía de respaldo.
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
      );
    });

    // `page.pdf()` ya emula media `print`. `preferCSSPageSize` deja mandar al
    // `@page { size: A4; margin: … }` de globals.css en vez de duplicar aquí el
    // tamaño del papel.
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    // Una instancia colgada en un entorno serverless se sigue pagando en memoria.
    await browser?.close().catch(() => {});
  }
}

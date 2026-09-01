import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { CookieData } from "puppeteer-core";
import { getAnalyst } from "@/lib/auth/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf/render";
import { env } from "@/lib/env";

export const runtime = "nodejs";
// Arranque en frío de Chromium + navegación + descarga de las imágenes firmadas.
export const maxDuration = 120;

/**
 * GET /api/admin/requests/:id/report
 *
 * Descarga el informe de la solicitud como PDF. Renderiza con Chromium la
 * MISMA página `/admin/requests/:id/report` que ve el analista, así que no hay
 * una segunda maqueta que mantener sincronizada.
 *
 * El navegador headless no comparte la sesión, así que se le reenvían las
 * cookies de esta petición: el guard sigue siendo el `getAnalyst()` de siempre,
 * sin inventar un esquema de tokens aparte.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const analyst = await getAnalyst();
  if (!analyst) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  // 404 temprano (no arrancar Chromium para nada) y de paso el ref del nombre.
  const supabase = await createServerSupabase();
  const { data: request } = await supabase
    .from("kyb_requests")
    .select("id, external_ref")
    .eq("id", id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // La URL se arma en el servidor a partir del id ya validado: este handler
  // nunca debe poder renderizar una URL arbitraria.
  const origin = requestOrigin(req);
  const url = `${origin}/admin/requests/${encodeURIComponent(id)}/report`;

  const store = await cookies();
  const host = new URL(origin).hostname;
  const jar: CookieData[] = store.getAll().map((c) => ({
    name: c.name,
    value: c.value,
    domain: host,
    path: "/",
  }));

  let pdf: Uint8Array;
  try {
    pdf = await renderPdf(url, jar);
  } catch (e) {
    const message = e instanceof Error ? e.message : "pdf_failed";
    console.error("[report] pdf render failed", message);
    return NextResponse.json({ error: "pdf_failed", message }, { status: 500 });
  }

  return new NextResponse(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameFor(request.external_ref, id)}"`,
      // Contiene datos personales: nunca en una caché intermedia.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Origen público de esta misma petición. Se prefiere a una variable de entorno
 * para que funcione igual en local, en preview y en producción.
 */
function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return env.appUrl();
  const proto =
    req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** `public:a1b2c3d4` lleva `:`, inválido en nombres de archivo en Windows. */
function filenameFor(externalRef: unknown, id: string): string {
  const base = typeof externalRef === "string" && externalRef ? externalRef : id;
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const day = new Date().toISOString().slice(0, 10);
  return `informe-${safe || id}-${day}.pdf`;
}

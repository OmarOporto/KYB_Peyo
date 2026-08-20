import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAnalyst } from "@/lib/auth/admin";
import { recordAiUsage } from "@/lib/i18n-ai/usage";
import { formDefinitionSchema } from "@/lib/forms/definition";
import { getTranslationProvider, translateAll } from "@/lib/i18n-ai";
import { collectTranslatable } from "@/lib/i18n-ai/walk";

export const runtime = "nodejs";
// Un lote de ~80 textos con un modelo grande puede tardar; el cliente pide una
// sección por vez, así que esto es holgado.
export const maxDuration = 120;

/**
 * POST /api/admin/forms/translate
 *
 * Traduce los textos de un formulario (o de una sección) al locale destino y
 * DEVUELVE los resultados: no escribe nada. El builder los aplica sobre su
 * estado local y persiste con el `saveForm` que ya existe.
 *
 * Es un Route Handler y no una Server Action a propósito. Next 16 despacha las
 * Server Actions de una en una por cliente, así que un loop por secciones
 * quedaría serializado
 * (node_modules/next/dist/docs/01-app/02-guides/server-actions.md). La guía
 * indica usar un Route Handler para trabajo paralelo y para peticiones que no
 * mutan — que es exactamente este caso. De paso evita la carrera
 * read-modify-write contra las ediciones sin guardar del analista.
 */
export async function POST(req: NextRequest) {
  const analyst = await getAnalyst();
  if (!analyst) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const body = (raw ?? {}) as {
    definition?: unknown;
    sectionId?: unknown;
    to?: unknown;
    force?: unknown;
    runId?: unknown;
    formId?: unknown;
  };

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) return NextResponse.json({ error: "missing_target_locale" }, { status: 400 });

  const parsed = formDefinitionSchema.safeParse(body.definition);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_definition" }, { status: 400 });
  }
  const def = parsed.data;
  const from = def.defaultLocale || "es";

  if (to === from) {
    return NextResponse.json({ error: "same_locale" }, { status: 400 });
  }

  const items = collectTranslatable(def, {
    to,
    sectionId: typeof body.sectionId === "string" ? body.sectionId : undefined,
    onlyMissing: body.force !== true,
  });

  const provider = getTranslationProvider();
  if (items.length === 0) {
    return NextResponse.json({
      results: [],
      requested: 0,
      missing: 0,
      model: provider.model,
      provider: provider.name,
    });
  }

  try {
    const { results, usage } = await translateAll(provider, items, { from, to });
    const returned = new Set(results.map((r) => r.id));
    const missing = items.filter((it) => !returned.has(it.id)).length;

    // Contabilidad: sin llamadas extra al proveedor — `usage` viene dentro de la
    // respuesta que ya se pagó. El `runId` lo genera el builder para que las N
    // llamadas por sección queden agrupadas como UNA corrida.
    const accounted = await recordAiUsage({
      runId: typeof body.runId === "string" ? body.runId : randomUUID(),
      operation: "form_translate",
      provider: provider.name,
      model: provider.model,
      fromLocale: from,
      toLocale: to,
      items: items.length,
      itemsReturned: results.length,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      actor: analyst.email,
      formId: typeof body.formId === "string" ? body.formId : null,
    });

    return NextResponse.json({
      results,
      requested: items.length,
      // Textos que el modelo no devolvió: quedan sin traducir y se reintentan
      // en el próximo pase (el modo "solo faltantes" los vuelve a tomar).
      missing,
      model: provider.model,
      provider: provider.name,
      usage,
      accounted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "translation_failed";
    console.error("[i18n-ai] translate failed", message);
    return NextResponse.json({ error: "translation_failed", message }, { status: 502 });
  }
}

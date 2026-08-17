import { NextRequest, NextResponse } from "next/server";
import { apiGuard } from "@/lib/auth/apiGuard";
import { getOwnedRequest } from "@/lib/kyb/apiRequests";
import { createServiceClient } from "@/lib/supabase/service";
import { createSignedDocUrls } from "@/lib/kyb/service";
import { resolveRequestDefinition } from "@/lib/forms/store";
import { serializeAnswers, collectFileRefs } from "@/lib/kyb/apiSerialize";
import { clientAllowsTranslation, translateAnswers } from "@/lib/i18n-ai/answers";

export const runtime = "nodejs";
// La traducción de respuestas llama a un proveedor externo.
export const maxDuration = 60;

/**
 * GET /api/v1/kyb/requests/:id/answers
 * Respuestas del formulario mapeadas a sus etiquetas legibles. Los campos
 * file/selfie incluyen URLs firmadas (temporales) de sus archivos.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await apiGuard(req.headers.get("authorization"));
  if ("response" in g) return g.response;
  const { id } = await params;

  const request = await getOwnedRequest(
    g.keyId,
    id,
    "id, external_ref, status, form_id, form_definition",
  );
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const supabase = createServiceClient();
  const { data: draftRow } = await supabase
    .from("kyb_form_responses")
    .select("data")
    .eq("request_id", id)
    .maybeSingle();
  const data = (draftRow?.data as Record<string, unknown>) ?? {};

  const definition = await resolveRequestDefinition(
    request.form_definition,
    (request.form_id as string | null) ?? null,
  );
  const locale =
    new URL(req.url).searchParams.get("locale") || definition?.defaultLocale || "es";

  const refs = collectFileRefs(definition, data);
  const signedUrls = await createSignedDocUrls(refs.map((r) => r.path));

  // Traducción del texto libre que escribió el solicitante. Opt-in por cliente
  // (`api_keys.allow_ai_translation`): manda PII a un proveedor externo. Si el
  // cliente no lo tiene habilitado se ignora en silencio y la respuesta es
  // idéntica a la histórica, en vez de fallar una integración que ya andaba.
  let translations: Record<string, string> | undefined;
  let translationEnabled = false;
  if (new URL(req.url).searchParams.get("translate") === "1") {
    translationEnabled = await clientAllowsTranslation(g.keyId);
    if (translationEnabled) {
      try {
        const out = await translateAnswers(String(request.id), definition, data, locale, {
          actor: `api:${g.keyId}`,
        });
        translations = out.byKey;
      } catch (e) {
        // Una falla del proveedor no debe tumbar la lectura de respuestas.
        console.error(
          "[i18n-ai] answers translation failed",
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  return NextResponse.json({
    id: request.id,
    externalRef: request.external_ref,
    status: request.status,
    ...(translationEnabled ? { translatedTo: locale } : {}),
    answers: serializeAnswers(definition, data, signedUrls, locale, translations),
  });
}

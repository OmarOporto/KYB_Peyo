import { NextRequest, NextResponse } from "next/server";
import { apiGuard } from "@/lib/auth/apiGuard";
import { getOwnedRequest } from "@/lib/kyb/apiRequests";
import { createServiceClient } from "@/lib/supabase/service";
import { createSignedDocUrls } from "@/lib/kyb/service";
import { resolveRequestDefinition } from "@/lib/forms/store";
import { serializeAnswers, collectFileRefs } from "@/lib/kyb/apiSerialize";

export const runtime = "nodejs";

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

  return NextResponse.json({
    id: request.id,
    externalRef: request.external_ref,
    status: request.status,
    answers: serializeAnswers(definition, data, signedUrls, locale),
  });
}

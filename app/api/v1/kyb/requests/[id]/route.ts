import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/apiKey";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * GET /api/v1/kyb/requests/:id
 * Auth: Bearer <api_key>. Devuelve estado + resultado (decisión + AML) para
 * que la app principal consulte el avance de la solicitud.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const keyId = await verifyApiKey(req.headers.get("authorization"));
  if (!keyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: request } = await supabase
    .from("kyb_requests")
    .select(
      "id, external_ref, status, decision, created_at, submitted_at, decided_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: amlChecks } = await supabase
    .from("aml_checks")
    .select("provider, status, result, created_at, updated_at")
    .eq("request_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    id: request.id,
    externalRef: request.external_ref,
    status: request.status,
    decision: request.decision,
    createdAt: request.created_at,
    submittedAt: request.submitted_at,
    decidedAt: request.decided_at,
    aml: amlChecks ?? [],
  });
}

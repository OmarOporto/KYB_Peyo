import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/apiKey";
import { consumeApiKey } from "@/lib/auth/rateLimit";
import { rateLimitResponse } from "@/lib/auth/rateLimitResponse";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * GET /api/v1/kyb/requests/:id
 * Auth: Bearer <api_key>. Devuelve estado + resultado (decisión + AML) para
 * que el cliente consulte el avance. Aislado por cliente: cada key solo ve
 * las solicitudes que ella misma creó.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const keyId = await verifyApiKey(req.headers.get("authorization"));
  if (!keyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await consumeApiKey(keyId);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: request } = await supabase
    .from("kyb_requests")
    .select(
      "id, external_ref, status, decision, decision_reason, corrections, created_at, submitted_at, decided_at, token_expires_at",
    )
    .eq("id", id)
    .eq("api_key_id", keyId)
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
    reason: request.decision_reason ?? null,
    corrections: request.corrections ?? null,
    expiresAt: request.token_expires_at ?? null,
    createdAt: request.created_at,
    submittedAt: request.submitted_at,
    decidedAt: request.decided_at,
    aml: amlChecks ?? [],
  });
}

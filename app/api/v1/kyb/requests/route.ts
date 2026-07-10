import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyApiKey } from "@/lib/auth/apiKey";
import { createRequest } from "@/lib/kyb/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  external_ref: z.string().min(1, "external_ref es requerido"),
  ttl_hours: z.number().int().positive().optional(),
  form_id: z.string().uuid().optional(),
});

/**
 * POST /api/v1/kyb/requests
 * Auth: Bearer <api_key>. Crea una solicitud KYB y devuelve el link de invitación.
 */
export async function POST(req: NextRequest) {
  const keyId = await verifyApiKey(req.headers.get("authorization"));
  if (!keyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await createRequest(
    parsed.data.external_ref,
    parsed.data.ttl_hours,
    parsed.data.form_id,
  );

  return NextResponse.json(
    {
      id: result.id,
      invitationUrl: result.invitationUrl,
      token: result.token,
      expiresAt: result.expiresAt,
      status: "created",
    },
    { status: 201 },
  );
}

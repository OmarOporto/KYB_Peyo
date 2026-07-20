import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { apiGuard } from "@/lib/auth/apiGuard";
import { getOwnedRequest } from "@/lib/kyb/apiRequests";
import { requestChanges } from "@/lib/kyb/service";
import { notifyClient } from "@/lib/kyb/webhook";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    fields: z
      .array(
        z
          .object({
            key: z.string().min(1),
            note: z.string().max(2000).optional(),
          })
          .strict(),
      )
      .min(1),
    ttl_hours: z.number().positive().optional(),
  })
  .strict();

/**
 * POST /api/v1/kyb/requests/:id/request-changes
 * Devuelve la solicitud al solicitante para que corrija preguntas puntuales.
 * Body: { fields: [{ key, note? }], ttl_hours? }. Borra las respuestas marcadas,
 * re-emite el link (nuevo `invitationUrl`) y pasa a `changes_requested`.
 * 409 si el estado no lo permite (no está `submitted`/`under_review`).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await apiGuard(req.headers.get("authorization"), { failClosed: true });
  if ("response" in g) return g.response;
  const { id } = await params;

  const owned = await getOwnedRequest(g.keyId, id, "id");
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 422 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 422 });
  }

  const res = await requestChanges(id, parsed.data.fields, {
    actor: `api_key:${g.keyId}`,
    source: "api",
    ttlHours: parsed.data.ttl_hours,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 });

  after(() => notifyClient(id, "changes.requested"));

  return NextResponse.json({
    id,
    status: "changes_requested",
    invitationUrl: res.invitationUrl,
    token: res.token,
    expiresAt: res.expiresAt,
    round: res.round,
  });
}

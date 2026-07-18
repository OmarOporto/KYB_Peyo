import { NextRequest, NextResponse } from "next/server";
import { apiGuard } from "@/lib/auth/apiGuard";
import { getOwnedRequest } from "@/lib/kyb/apiRequests";
import { reissueInvitation } from "@/lib/kyb/service";

export const runtime = "nodejs";

/**
 * POST /api/v1/kyb/requests/:id/invitation
 * Re-emite el link de invitación (mismo borrador) si se perdió o expiró.
 * Body opcional: { ttl_hours }.
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

  let ttlHours: number | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.ttl_hours === "number" && body.ttl_hours > 0) {
      ttlHours = body.ttl_hours;
    }
  } catch {
    // sin body → TTL por defecto
  }

  const res = await reissueInvitation(id, ttlHours);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 });

  return NextResponse.json({
    invitationUrl: res.invitationUrl,
    token: res.token,
    expiresAt: res.expiresAt,
  });
}

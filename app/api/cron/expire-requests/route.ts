import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { expireDueRequests } from "@/lib/kyb/service";
import { notifyClient } from "@/lib/kyb/webhook";

export const runtime = "nodejs";
// Margen para expirar y notificar varias solicitudes en una corrida.
export const maxDuration = 60;

/**
 * GET /api/cron/expire-requests — barrido programado (Vercel Cron, diario).
 * Expira las solicitudes cuyo link ya venció y siguen esperando al solicitante,
 * y dispara el webhook `request.expired` por cada una. Autorizado por
 * `Authorization: Bearer $CRON_SECRET` (Vercel lo añade automáticamente).
 * Fail-closed: sin `CRON_SECRET` configurado → 401.
 */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expired = await expireDueRequests();
  // Notifica al cliente de cada solicitud expirada (no-op si no tiene webhook).
  for (const id of expired) {
    await notifyClient(id, "request.expired");
  }

  return NextResponse.json({ expired: expired.length });
}

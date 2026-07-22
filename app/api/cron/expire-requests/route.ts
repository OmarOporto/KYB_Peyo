import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  expireDueRequests,
  notifyExpiringSoonRequests,
} from "@/lib/kyb/service";
import { notifyClient } from "@/lib/kyb/webhook";

export const runtime = "nodejs";
// Margen para expirar/avisar y notificar varias solicitudes en una corrida.
export const maxDuration = 60;

/**
 * GET /api/cron/expire-requests — barrido programado (Vercel Cron, diario).
 * Dos barridos disjuntos sobre solicitudes pre-envío:
 *  - `request.expiring`: links que vencen dentro de la ventana (aviso proactivo).
 *  - `request.expired`:  links que YA vencieron (se pasan a `expired`).
 * Autorizado por `Authorization: Bearer $CRON_SECRET` (Vercel lo añade solo).
 * Fail-closed: sin `CRON_SECRET` configurado → 401.
 */
export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Ya vencidas → expiran y notifican (no-op si la solicitud no tiene webhook).
  const expired = await expireDueRequests();
  for (const id of expired) {
    await notifyClient(id, "request.expired");
  }

  // Por vencer (aviso proactivo, una sola vez por ciclo de link).
  const expiring = await notifyExpiringSoonRequests();
  for (const id of expiring) {
    await notifyClient(id, "request.expiring");
  }

  return NextResponse.json({
    expired: expired.length,
    expiring: expiring.length,
  });
}

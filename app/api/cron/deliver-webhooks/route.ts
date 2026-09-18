import { NextRequest, NextResponse } from "next/server";
import { cronGuard } from "@/lib/auth/cronGuard";
import { drainDueDeliveries } from "@/lib/kyb/webhook";

export const runtime = "nodejs";
// Un lote de DRAIN_BATCH_SIZE entregas, cada una con timeout de 5 s en el peor
// caso. Holgado para que ninguna corrida se corte a mitad del lote.
export const maxDuration = 120;

/**
 * GET /api/cron/deliver-webhooks — drena la cola de entregas pendientes.
 *
 * Corre **cada minuto** (ver vercel.json): el primer escalón del backoff es de
 * 1 minuto, así que una frecuencia menor lo volvería decorativo.
 *
 * Autorizado por `Authorization: Bearer $CRON_SECRET` (Vercel lo añade solo).
 * Fail-closed: sin `CRON_SECRET` configurado → 401.
 */
export async function GET(req: NextRequest) {
  const denied = cronGuard(req);
  if (denied) return denied;

  const { attempted, delivered } = await drainDueDeliveries();

  return NextResponse.json({ attempted, delivered });
}

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/tokens";

/**
 * Autoriza un endpoint de cron por `Authorization: Bearer $CRON_SECRET`
 * (Vercel lo añade solo). Fail-closed: sin `CRON_SECRET` configurado, 401.
 *
 * Devuelve la respuesta de error, o `null` si la petición está autorizada. La
 * comparación es en tiempo constante; antes cada ruta hacía un `!==` sobre el
 * header completo, que compara byte a byte y corta en la primera diferencia.
 */
export function cronGuard(req: NextRequest): NextResponse | null {
  const secret = env.cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  const prefix = "Bearer ";

  if (!secret || !auth.startsWith(prefix)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!safeEqual(auth.slice(prefix.length), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

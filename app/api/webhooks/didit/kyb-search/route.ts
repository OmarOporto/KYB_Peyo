import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveKybSearch } from "@/lib/didit/verify";
import { logAudit } from "@/lib/kyb/service";
import { safeEqual } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La resolución puede disparar el select facturable (~60s de presupuesto).
export const maxDuration = 120;

/**
 * Callback de DIDIT `kyb.registry_search.resolved` (búsqueda registral async).
 * DIDIT lo envía SIN firma (header X-Didit-Unsigned-Callback) — la
 * autenticación es el token aleatorio por-búsqueda en la query (?t=), generado
 * en runKybRegistryCheck, más el match de request_id contra una fila
 * pending/search. Idempotente: filas ya resueltas se ignoran con 200.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const requestId = typeof body.request_id === "string" ? body.request_id : "";
  const regNode = (body.kyb_registry ?? {}) as Record<string, unknown>;
  if (!requestId || !body.kyb_registry) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const resolved = body.search_resolved === true || regNode.search_resolved === true;
  if (!resolved) return NextResponse.json({ ok: true, ignored: "unresolved" });

  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from("aml_checks")
    .select("id, request_id, status, result")
    .eq("provider", "didit")
    .eq("feature", "kyb_registry")
    .eq("status", "pending")
    .eq("external_ref", requestId)
    .limit(1);
  const row = rows?.[0];
  const result = (row?.result ?? {}) as Record<string, unknown>;
  const token = req.nextUrl.searchParams.get("t") ?? "";

  // Una sola respuesta para todos los fallos previos a autenticar. Antes cada
  // motivo tenía su código ("no_pending_row", "not_in_search", 401), así que un
  // llamador anónimo podía sondear qué request_id de DIDIT tenía una fila
  // pendiente en fase de búsqueda. El motivo queda en el log del servidor.
  const authorized =
    !!row &&
    result.phase === "search" &&
    typeof result.search_token === "string" &&
    safeEqual(token, result.search_token);

  if (!authorized) {
    console.warn(
      `[DIDIT] kyb-search callback rechazado request_id=${requestId} ` +
        `row=${!!row} phase=${String(result.phase)} token=${token ? "presente" : "ausente"}`,
    );
    // 200 y no 401: una entrega repetida sobre una fila ya resuelta es normal y
    // debe cerrarse sin reintentos (este callback es idempotente por diseño).
    // Al ser la misma respuesta que el rechazo por token, tampoco queda nada
    // que sondear desde afuera.
    return NextResponse.json({ ok: true });
  }

  const { data: kybReq } = await supabase
    .from("kyb_requests")
    .select("external_ref")
    .eq("id", row.request_id)
    .maybeSingle();
  if (!kybReq) return NextResponse.json({ error: "request_not_found" }, { status: 404 });

  console.log(
    `[DIDIT] kyb-search resuelto request_id=${requestId} check=${row.id} ` +
      `companies=${Array.isArray(regNode.companies) ? regNode.companies.length : 0}`,
  );
  await resolveKybSearch({
    checkId: row.id as string,
    declaredJson: (result.declared ?? {}) as Record<string, unknown>,
    search: body,
    searchRef: requestId,
    vendorData: kybReq.external_ref,
  });
  await logAudit({
    requestId: row.request_id as string,
    actor: "didit-webhook",
    action: "kyb_registry_search_resolved",
    metadata: { checkId: row.id },
  });
  return NextResponse.json({ ok: true });
}

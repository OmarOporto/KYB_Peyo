import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveKybSearch } from "@/lib/didit/verify";
import { logAudit } from "@/lib/kyb/service";

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
  if (!row) return NextResponse.json({ ok: true, ignored: "no_pending_row" });
  const result = (row.result ?? {}) as Record<string, unknown>;
  if (result.phase !== "search") {
    return NextResponse.json({ ok: true, ignored: "not_in_search" });
  }
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!token || typeof result.search_token !== "string" || token !== result.search_token) {
    console.warn(`[DIDIT] kyb-search callback rechazado (token) request_id=${requestId}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

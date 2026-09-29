import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { diditGet } from "./http";
import {
  DIDIT_FEATURE_TARIFFS,
  DIDIT_KYB_TARIFFS,
  featureFromApiService,
  parseCostBreakdown,
} from "./pricing";

// ============================================================
// Registro de cargos DIDIT (tabla didit_charges, 0027)
// ------------------------------------------------------------
// Nada de esto lanza: se llama DESPUÉS de una verificación que ya se pagó, y
// fallar por contabilidad perdería el resultado (mismo criterio que
// recordAiUsage). Lo que no se pudo registrar lo recupera syncDiditCharges.
// ============================================================

const COST_TIMEOUT_MS = 10_000;
/** Pedidos simultáneos a DIDIT al sincronizar (sin límite documentado). */
const SYNC_CONCURRENCY = 4;
/** Sesiones listadas por corrida de sincronización (5 páginas de 100). */
const SYNC_MAX_SESSIONS = 500;
/** Tras esto, una sesión que sigue sin cost_breakdown toma la tarifa. */
const TARIFF_FALLBACK_AFTER_MS = 24 * 60 * 60 * 1000;

function logError(what: string, e: unknown) {
  console.error(`[DIDIT costs] ${what}:`, e instanceof Error ? e.message : String(e));
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Decisión de una sesión con su cost_breakdown. `null` si DIDIT no responde. */
async function fetchDecision(sessionId: string): Promise<Record<string, unknown> | null> {
  try {
    return await diditGet(
      `/v3/session/${encodeURIComponent(sessionId)}/decision/?include=events`,
      COST_TIMEOUT_MS,
    );
  } catch (e) {
    logError(`decision ${sessionId}`, e);
    return null;
  }
}

/**
 * Cargo de una verificación de persona recién despachada. Pide el costo a
 * DIDIT; si todavía no lo informa, el cargo queda pendiente (amount NULL).
 */
export async function recordCheckCharge(input: {
  orgId: string;
  requestId: string;
  checkId: string | null;
  feature: string;
  sessionId: string;
}): Promise<void> {
  try {
    const decision = await fetchDecision(input.sessionId);
    const cost = decision ? parseCostBreakdown(decision) : null;
    const { error } = await createServiceClient()
      .from("didit_charges")
      .upsert(
        {
          org_id: input.orgId,
          request_id: input.requestId,
          check_id: input.checkId,
          feature: input.feature,
          kind: "verification",
          session_id: input.sessionId,
          amount: cost?.total ?? null,
          source: "didit",
          details: cost?.raw ?? null,
          synced_at: cost ? new Date().toISOString() : null,
        },
        // Sin monto no se pisa un cargo que ya lo tenga.
        { onConflict: "kind,session_id", ignoreDuplicates: !cost },
      );
    if (error) logError(`insert ${input.sessionId}`, error);
  } catch (e) {
    logError(`recordCheckCharge ${input.sessionId}`, e);
  }
}

/**
 * Cargo de la validación de empresa, por tarifa pública (las sesiones de
 * empresa no traen cost_breakdown). La solicitud y la org salen del check.
 */
export async function recordKybCharge(input: {
  checkId: string;
  kind: "kyb_search" | "kyb_select";
  sessionId: string | null;
  /** Select enviado sin confirmación (timeout/5xx): pudo facturarse. */
  unconfirmed?: boolean;
  /** Cuándo ocurrió el cobro (al cargar historial); por defecto, ahora. */
  at?: string;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: check } = await supabase
      .from("aml_checks")
      .select("request_id, kyb_requests(org_id)")
      .eq("id", input.checkId)
      .maybeSingle();
    const req = check?.kyb_requests as { org_id?: string } | { org_id?: string }[] | null;
    const orgId = Array.isArray(req) ? req[0]?.org_id : req?.org_id;
    if (!check || !orgId) {
      logError(`kyb ${input.checkId}`, "check u org no encontrados");
      return;
    }

    // Sin session_id la clave única no protege: se evita el duplicado por check.
    if (!input.sessionId) {
      const { data: existing } = await supabase
        .from("didit_charges")
        .select("id")
        .eq("check_id", input.checkId)
        .eq("kind", input.kind)
        .limit(1);
      if (existing?.length) return;
    }

    const { error } = await supabase.from("didit_charges").upsert(
      {
        org_id: orgId,
        request_id: check.request_id,
        check_id: input.checkId,
        feature: "kyb_registry",
        kind: input.kind,
        session_id: input.sessionId,
        amount: DIDIT_KYB_TARIFFS[input.kind],
        source: "tariff",
        details: input.unconfirmed ? { unconfirmed: true } : null,
        ...(input.at ? { created_at: input.at } : {}),
        synced_at: new Date().toISOString(),
      },
      { onConflict: "kind,session_id", ignoreDuplicates: true },
    );
    if (error) logError(`insert kyb ${input.checkId}`, error);
  } catch (e) {
    logError(`recordKybCharge ${input.checkId}`, e);
  }
}

export interface DiditBalance {
  balance: number;
  autoRefill: boolean;
}

/** Saldo prepago de TODA la cuenta DIDIT (compartida entre entornos). */
export async function getDiditBalance(): Promise<DiditBalance | null> {
  try {
    const json = await diditGet("/v3/billing/balance/", 8_000);
    const balance = Number(json.balance);
    if (!Number.isFinite(balance)) return null;
    return { balance, autoRefill: json.auto_refill_enabled === true };
  } catch (e) {
    logError("balance", e);
    return null;
  }
}

export interface SyncResult {
  /** Pendientes a los que se les completó el monto. */
  filled: number;
  /** Sesiones de este entorno que no estaban registradas. */
  added: number;
  /** Cargos de validación de empresa registrados desde los checks. */
  kyb: number;
  /** Sesiones de la cuenta que no son de esta base (otro entorno). */
  skipped: number;
  /** Siguen sin monto después de sincronizar. */
  pending: number;
  /** DIDIT no respondió: solo se registró lo que sale de la base local. */
  diditUnreachable: boolean;
}

type SessionListItem = {
  session_id?: string;
  vendor_data?: string | null;
  created_at?: string;
  features?: { feature?: string }[] | null;
};

/**
 * Reconciliación con DIDIT (botón del panel; también carga el historial la
 * primera vez):
 *   1. completa los cargos pendientes;
 *   2. agrega las sesiones de persona de esta base que falten — incluidas las
 *      de checks que una corrección ya borró —, saltando las de otros entornos;
 *   3. registra por tarifa las validaciones de empresa previas a este registro.
 */
export async function syncDiditCharges(): Promise<SyncResult> {
  const supabase = createServiceClient();
  const now = Date.now();
  const out: SyncResult = {
    filled: 0,
    added: 0,
    kyb: 0,
    skipped: 0,
    pending: 0,
    diditUnreachable: false,
  };

  // --- 1. pendientes ---
  const { data: pendingRows } = await supabase
    .from("didit_charges")
    .select("id, feature, session_id, created_at")
    .eq("kind", "verification")
    .is("amount", null)
    .not("session_id", "is", null)
    .limit(200);
  await mapLimit(pendingRows ?? [], SYNC_CONCURRENCY, async (r) => {
    const decision = await fetchDecision(r.session_id as string);
    if (!decision) return; // DIDIT no respondió: se reintenta la próxima vez
    const cost = parseCostBreakdown(decision);
    const stale = now - new Date(r.created_at as string).getTime() > TARIFF_FALLBACK_AFTER_MS;
    const fallback = DIDIT_FEATURE_TARIFFS[r.feature as string];
    if (!cost && !(stale && fallback != null)) return;
    const { error } = await supabase
      .from("didit_charges")
      .update(
        cost
          ? { amount: cost.total, source: "didit", details: cost.raw, synced_at: new Date().toISOString() }
          : {
              amount: fallback,
              source: "tariff",
              details: { fallback: "no_cost_breakdown" },
              synced_at: new Date().toISOString(),
            },
      )
      .eq("id", r.id as string);
    if (!error) out.filled += 1;
  });

  // --- 2. sesiones de persona que falten ---
  for (let offset = 0; offset < SYNC_MAX_SESSIONS; offset += 100) {
    let page: SessionListItem[];
    let hasNext: boolean;
    try {
      const json = await diditGet(
        `/v3/sessions/?session_kind=user&limit=100&offset=${offset}`,
        COST_TIMEOUT_MS,
      );
      page = (Array.isArray(json.results) ? json.results : []) as SessionListItem[];
      hasNext = Boolean(json.next);
    } catch (e) {
      logError("listado de sesiones", e);
      out.diditUnreachable = true;
      break;
    }
    const ids = page.map((s) => s.session_id).filter((id): id is string => Boolean(id));
    if (!ids.length) break;

    const [{ data: known }, { data: checks }] = await Promise.all([
      supabase.from("didit_charges").select("session_id").eq("kind", "verification").in("session_id", ids),
      supabase
        .from("aml_checks")
        .select("id, request_id, feature, external_ref")
        .eq("provider", "didit")
        .in("external_ref", ids),
    ]);
    const knownIds = new Set((known ?? []).map((k) => k.session_id as string));
    const checkByRef = new Map((checks ?? []).map((c) => [c.external_ref as string, c]));
    const fresh = page.filter((s) => s.session_id && !knownIds.has(s.session_id));

    // Solicitudes candidatas: las de los checks y las del vendor_data (= external_ref).
    const vendorRefs = [
      ...new Set(fresh.map((s) => s.vendor_data).filter((v): v is string => Boolean(v))),
    ];
    const checkRequestIds = [...new Set((checks ?? []).map((c) => c.request_id as string))];
    const [{ data: byRef }, { data: byId }] = await Promise.all([
      vendorRefs.length
        ? supabase
            .from("kyb_requests")
            .select("id, org_id, external_ref, created_at")
            .in("external_ref", vendorRefs)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      checkRequestIds.length
        ? supabase.from("kyb_requests").select("id, org_id").in("id", checkRequestIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);
    const orgByRequest = new Map(
      [...(byRef ?? []), ...(byId ?? [])].map((r) => [r.id as string, r.org_id as string]),
    );

    await mapLimit(fresh, SYNC_CONCURRENCY, async (s) => {
      const sessionId = s.session_id as string;
      const check = checkByRef.get(sessionId);
      let requestId = (check?.request_id as string | undefined) ?? null;
      if (!requestId && s.vendor_data) {
        // external_ref no es único: la solicitud más reciente creada antes de la sesión.
        const at = s.created_at ? new Date(s.created_at).getTime() : now;
        const match = (byRef ?? [])
          .filter(
            (r) => r.external_ref === s.vendor_data && new Date(r.created_at as string).getTime() <= at,
          )
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        requestId = (match?.id as string | undefined) ?? null;
      }
      const orgId = requestId ? orgByRequest.get(requestId) : undefined;
      if (!requestId || !orgId) {
        out.skipped += 1;
        return;
      }

      const decision = await fetchDecision(sessionId);
      const cost = decision ? parseCostBreakdown(decision) : null;
      const feature =
        (check?.feature as string | undefined) ??
        featureFromApiService(decision?.api_service ?? s.features?.[0]?.feature) ??
        "unknown";
      const { error } = await supabase.from("didit_charges").upsert(
        {
          org_id: orgId,
          request_id: requestId,
          check_id: (check?.id as string | undefined) ?? null,
          feature,
          kind: "verification",
          session_id: sessionId,
          amount: cost?.total ?? null,
          source: "didit",
          details: cost?.raw ?? null,
          // El cargo se fecha cuando ocurrió, no cuando se sincronizó.
          created_at: s.created_at ?? new Date().toISOString(),
          synced_at: cost ? new Date().toISOString() : null,
        },
        { onConflict: "kind,session_id", ignoreDuplicates: true },
      );
      if (!error) out.added += 1;
    });

    if (!hasNext) break;
  }

  // --- 3. validaciones de empresa previas al registro ---
  const { data: kybChecks } = await supabase
    .from("aml_checks")
    .select("id, external_ref, result, created_at")
    .eq("provider", "didit")
    .eq("feature", "kyb_registry");
  const { data: kybCharged } = await supabase
    .from("didit_charges")
    .select("check_id, kind")
    .eq("feature", "kyb_registry");
  const has = new Set((kybCharged ?? []).map((c) => `${c.check_id}:${c.kind}`));
  for (const c of kybChecks ?? []) {
    const res = (c.result ?? {}) as Record<string, unknown>;
    const search = (res.kyb_search ?? {}) as Record<string, unknown>;
    const companies = ((search.kyb_registry ?? {}) as Record<string, unknown>).companies;
    const checkId = c.id as string;
    // Búsqueda resuelta con candidatos: la única que DIDIT puede haber cobrado.
    if (Array.isArray(companies) && companies.length && !has.has(`${checkId}:kyb_search`)) {
      await recordKybCharge({
        checkId,
        kind: "kyb_search",
        sessionId: (search.request_id as string) || null,
        at: c.created_at as string,
      });
      out.kyb += 1;
    }
    const selected = res.selected as Record<string, unknown> | undefined;
    if (selected?.select_attempted && !has.has(`${checkId}:kyb_select`)) {
      const charged = selected.billing_state === "charged";
      await recordKybCharge({
        checkId,
        kind: "kyb_select",
        sessionId: charged ? ((c.external_ref as string) || null) : null,
        unconfirmed: !charged,
        at: (selected.at as string | undefined) ?? (c.created_at as string),
      });
      out.kyb += 1;
    }
  }

  const { count } = await supabase
    .from("didit_charges")
    .select("id", { count: "exact", head: true })
    .is("amount", null);
  out.pending = count ?? 0;
  return out;
}

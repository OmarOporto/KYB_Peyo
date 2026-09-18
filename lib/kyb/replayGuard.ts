import "server-only";
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

/** Se descartan las entregas vistas hace más de esto (ver `forget`). */
const RETENTION_DAYS = 7;

/**
 * ¿Ya procesamos esta entrega de webhook?
 *
 * Deduplica por hash del cuerpo crudo. Como la firma del proveedor cubre el
 * cuerpo, un replay de una entrega capturada es necesariamente idéntico byte a
 * byte, así que esto lo detecta sin depender del esquema del payload.
 */
export async function alreadySeen(
  provider: string,
  rawBody: string,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("webhook_replay_guard")
    .select("body_hash")
    .eq("provider", provider)
    .eq("body_hash", hashBody(rawBody))
    .maybeSingle();
  return Boolean(data);
}

/**
 * Marca la entrega como procesada. Se llama DESPUÉS de procesarla con éxito y
 * no antes: si se reclamara al entrar, un fallo a mitad dejaría la marca puesta
 * y el reintento legítimo del proveedor se descartaría como replay.
 *
 * El precio es que dos entregas idénticas simultáneas pueden procesarse las
 * dos; da igual, porque la escritura que hacen es la misma.
 */
export async function markSeen(provider: string, rawBody: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("webhook_replay_guard")
    .insert({ provider, body_hash: hashBody(rawBody) });

  // Limpieza oportunista, como en consume_api_key: la tabla no crece sin fin.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  await supabase.from("webhook_replay_guard").delete().lt("seen_at", cutoff);
}

function hashBody(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

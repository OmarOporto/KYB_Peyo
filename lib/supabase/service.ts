import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente con service-role. SOLO servidor. Ignora RLS.
 * Se usa para los flujos del solicitante (token-gated) y operaciones de sistema.
 * Nunca debe exponerse al navegador.
 */
export function createServiceClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

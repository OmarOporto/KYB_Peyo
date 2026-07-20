/**
 * Acceso centralizado a variables de entorno.
 * Los helpers *server* solo deben importarse desde código server-only.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: () =>
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  // server-only
  supabaseServiceRoleKey: () =>
    required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  amlProvider: () => process.env.AML_PROVIDER ?? "mock",
  diditApiUrl: () => process.env.DIDIT_API_URL ?? "",
  diditApiKey: () => process.env.DIDIT_API_KEY ?? "",
  diditWebhookSecret: () => process.env.DIDIT_WEBHOOK_SECRET ?? "",
  // Secreto compartido para firmar el webhook saliente hacia el cliente API.
  kybWebhookSecret: () => process.env.KYB_WEBHOOK_SECRET ?? "",
  // Clave (32 bytes base64) para cifrar secretos de webhook por endpoint (AES-256-GCM).
  secretEncKey: () => process.env.KYB_SECRET_ENC_KEY ?? "",
  // Secreto compartido para autorizar el cron de expiración (Vercel Cron envía
  // `Authorization: Bearer $CRON_SECRET`). Sin él, la ruta cron responde 401.
  cronSecret: () => process.env.CRON_SECRET ?? "",
  // Límite de tasa por defecto (req/min por API key) si la key no fija uno propio.
  apiRateLimitDefault: () => {
    const n = Number(process.env.API_RATE_LIMIT_DEFAULT_PER_MIN);
    return Number.isFinite(n) && n > 0 ? n : 60;
  },
};

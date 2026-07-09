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
};

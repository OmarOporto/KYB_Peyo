/**
 * Variables de entorno `NEXT_PUBLIC_*`: las únicas que Next inlinea en el
 * bundle del navegador y, por lo tanto, las únicas que puede importar un módulo
 * cliente.
 *
 * Existe separado de `lib/env.ts` para que ese archivo —el que expone
 * `supabaseServiceRoleKey()`, `diditApiKey()`, `cronSecret()` y compañía— pueda
 * llevar `import "server-only"` y quedar fuera del grafo del cliente. Antes lo
 * importaba `lib/supabase/client.ts`, que es `"use client"`: no filtraba nada
 * (los secretos quedan `undefined` en el bundle), pero bastaba un
 * `const X = process.env.Y` a nivel de módulo para que sí lo hiciera.
 */

export function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: () =>
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

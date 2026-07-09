"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/** Cliente de navegador para el panel admin (login / sesión). */
export function createBrowserSupabase() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}

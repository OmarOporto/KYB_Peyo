"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env.public";

/** Cliente de navegador para el panel admin (login / sesión). */
export function createBrowserSupabase() {
  return createBrowserClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey());
}

"use server";

import { cookies } from "next/headers";
import { getAuthState } from "@/lib/auth/admin";
import {
  PORTAL_COOKIE,
  parsePortal,
  postLoginOutcome,
  type PostLoginOutcome,
} from "@/lib/auth/accountRules";

/** Un año: es una preferencia del dispositivo, no de la sesión. */
const PORTAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Después de un inicio de sesión exitoso, decide a dónde va la persona según
 * su cuenta y el portal por el que entró.
 *
 * El inicio de sesión en sí sigue en el navegador (captcha y límites por IP de
 * quien entra, no de Vercel); acá solo se lee el estado. Con `error` el
 * cliente cierra la sesión recién creada. No es una frontera de seguridad: los
 * permisos reales los ponen requireAdmin y la RLS.
 */
export async function postLoginAction(portalValue: string): Promise<PostLoginOutcome> {
  const portal = parsePortal(portalValue);
  const outcome = postLoginOutcome((await getAuthState()).state, portal);
  if ("next" in outcome) {
    // Pista para mandar a cada uno a su login cuando vence la sesión.
    (await cookies()).set(PORTAL_COOKIE, portal, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PORTAL_COOKIE_MAX_AGE,
    });
  }
  return outcome;
}

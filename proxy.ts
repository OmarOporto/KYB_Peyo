import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresca la sesión de Supabase (cookies) en las rutas del panel admin y corta
 * al visitante anónimo antes de que el panel empiece a renderizarse.
 *
 * Ese corte es un ATAJO, no el guard: la guía de Next es explícita en que el
 * proxy sirve para chequeos optimistas y no debe ser la solución de
 * autorización. El permiso real —tener fila en `analysts`— lo exige cada página
 * con `requireAnalyst()`, que es lo único que decide de verdad.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /admin/login queda fuera o sería un bucle de redirecciones. Es también la
  // razón por la que el guard no puede vivir en un app/admin/layout.tsx: ese
  // layout envolvería al propio login.
  if (!user && !request.nextUrl.pathname.startsWith("/admin/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};

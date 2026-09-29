import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PORTAL_COOKIE, loginPath, parsePortal } from "@/lib/auth/accountRules";

/**
 * Refresca la sesión de Supabase (cookies) en el panel y en las pantallas de
 * acceso, y corta al visitante anónimo antes de que el panel empiece a
 * renderizarse.
 *
 * Ese corte es un ATAJO, no el guard: la guía de Next es explícita en que el
 * proxy sirve para chequeos optimistas y no debe ser la solución de
 * autorización. El permiso real —tener fila en `analysts`— lo exige cada página
 * con `requireAnalyst()`, que es lo único que decide de verdad.
 *
 * /login y /auth/* pasan por acá aunque no se redirijan: un Server Component
 * no puede escribir cookies, así que si la sesión se refrescara ahí el refresh
 * token nuevo se perdería (y reusar el viejo revoca la sesión entera). Los
 * Server Actions de esas pantallas también son POSTs a su ruta.
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

  // Solo el panel exige sesión. /admin/login (exacto) queda fuera o sería un
  // bucle de redirecciones; por eso el guard tampoco puede vivir en un
  // app/admin/layout.tsx, que envolvería al propio login.
  const { pathname } = request.nextUrl;
  const isPanel = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!user && isPanel && pathname !== "/admin/login") {
    const url = request.nextUrl.clone();
    // La cookie recuerda por qué portal entró la última vez: el admin cuya
    // sesión venció vuelve a /admin/login y no al login de usuarios.
    url.pathname = loginPath(parsePortal(request.cookies.get(PORTAL_COOKIE)?.value));
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/auth/:path*"],
};

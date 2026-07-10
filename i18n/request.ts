import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, locales } from "./config";

/** Resuelve el locale desde la cookie NEXT_LOCALE, con fallback a Accept-Language. */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale = isLocale(cookieLocale) ? cookieLocale : undefined;

  if (!locale) {
    const accept = (await headers()).get("accept-language") ?? "";
    const preferred = accept.split(",")[0]?.split("-")[0]?.trim();
    locale = isLocale(preferred) ? preferred : defaultLocale;
  }

  // Garantiza un locale soportado.
  if (!locales.includes(locale)) locale = defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

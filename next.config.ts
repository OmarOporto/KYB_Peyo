import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // No se restringe `camera` (el selfie usa getUserMedia).
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=()" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El default de Next es 1 MB. Subir el submit, el autosave y las subidas
      // de documentos/selfies pasan por Server Actions, así que necesitamos
      // margen sobre el tope de 15 MB del validador (+ overhead multipart).
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // La página del solicitante lleva el token en la URL: evitar fuga por
        // referer, caché e indexado.
        source: "/f/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

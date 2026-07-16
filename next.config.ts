import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El default de Next es 1 MB. Subir el submit, el autosave y las subidas
      // de documentos/selfies pasan por Server Actions, así que necesitamos
      // margen sobre el tope de 15 MB del validador (+ overhead multipart).
      bodySizeLimit: "20mb",
    },
  },
};

export default withNextIntl(nextConfig);

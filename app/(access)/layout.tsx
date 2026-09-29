import { AuthShell } from "@/components/auth/AuthShell";

/**
 * Pantallas de acceso de los usuarios (/login) y las compartidas por los dos
 * portales (/auth/forgot, /confirm, /reset, /mfa, /suspended). Fuera de
 * /admin a propósito: se ven sin sesión, y así la URL de un cliente no dice
 * "admin". El login de administración vive aparte, en /admin/login.
 */
export default function AccessLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}

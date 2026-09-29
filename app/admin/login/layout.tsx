import { AuthShell } from "@/components/auth/AuthShell";

/**
 * Login de administración (/admin/login), separado del de usuarios (/login).
 * Las pantallas compartidas (recuperar contraseña, 2FA, confirmar links) viven
 * en /auth/*. El proxy deja pasar exactamente /admin/login sin sesión.
 */
export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell variant="admin">{children}</AuthShell>;
}

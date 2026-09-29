import { AuthShell } from "@/components/auth/AuthShell";

/**
 * Todas las pantallas de acceso (/admin/login, /forgot, /reset, /confirm,
 * /mfa) comparten el marco. Están fuera de `(dash)` a propósito: se ven sin
 * sesión, y el proxy deja pasar todo lo que empieza con /admin/login.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}

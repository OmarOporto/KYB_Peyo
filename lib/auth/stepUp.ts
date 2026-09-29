import "server-only";
import { consumeRate } from "./rateLimit";
import { createServiceClient } from "@/lib/supabase/service";

/** Intentos de contraseña por usuario y minuto. */
const PASSWORD_ATTEMPTS_PER_MIN = 5;

/**
 * ¿Es la contraseña actual de este usuario? Se usa para volver a pedirla antes
 * de acciones sensibles: cambiar la propia contraseña o email (Seguridad) y,
 * en la gestión de cuentas, invitar, dar rol admin o tocar credenciales de
 * otro. Con una sesión robada no alcanza.
 *
 * Con rate limit por usuario: sin él, una sesión robada podría probar
 * contraseñas a mansalva. `verify_user_password` es solo de service_role
 * (0026_security.sql).
 */
export async function checkCurrentPassword(
  userId: string,
  password: string,
): Promise<"ok" | "wrong" | "limited"> {
  if (!password) return "wrong";
  const rate = await consumeRate(`pwverify:${userId}`, PASSWORD_ATTEMPTS_PER_MIN);
  if (!rate.allowed) return "limited";
  const { data, error } = await createServiceClient().rpc("verify_user_password", {
    p_user_id: userId,
    p_password: password,
  });
  if (error) {
    console.error("[stepUp] verify_user_password falló:", error.message);
    return "wrong";
  }
  return data === true ? "ok" : "wrong";
}

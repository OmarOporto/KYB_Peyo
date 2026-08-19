import "server-only";
import { env } from "@/lib/env";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/**
 * Alerta operativa por correo (Resend), vía `fetch` — sin dependencia npm
 * nueva, igual que las integraciones de DIDIT y OpenAI de este repo.
 *
 * **Nunca lanza.** La dispara código que no puede fallar por no poder avisar
 * (el drenado de webhooks). Sin `RESEND_API_KEY` o sin destinatario, se omite
 * con un warn y devuelve `false`.
 */
export async function sendAlert(subject: string, lines: string[]): Promise<boolean> {
  const apiKey = env.resendApiKey();
  const to = env.alertEmailTo();

  if (!apiKey || !to) {
    console.warn(`[alert] sin RESEND_API_KEY o ALERT_EMAIL_TO; se omite: ${subject}`);
    return false;
  }

  const text = lines.join("\n");
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.alertEmailFrom(),
        to: to.split(",").map((t) => t.trim()).filter(Boolean),
        subject,
        text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[alert] Resend ${res.status}: ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[alert] fallo al enviar:", e instanceof Error ? e.message : e);
    return false;
  }
}

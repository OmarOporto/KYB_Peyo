"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, Mail } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { authErrorKey } from "@/lib/auth/authErrors";
import { Turnstile, turnstileEnabled, type TurnstileHandle } from "@/components/auth/Turnstile";
import { AuthAlert, AuthLabel, authButtonCls, authInputCls } from "@/components/auth/authUi";

/**
 * Pide el correo de recuperación. El link lo arma nuestra plantilla
 * (supabase/templates/recovery.html) y lleva a /admin/login/confirm.
 */
export function ForgotForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const needsCaptcha = turnstileEnabled();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (needsCaptcha && !captcha) {
      setError(t("errCaptchaPending"));
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await createBrowserSupabase().auth.resetPasswordForEmail(email.trim(), {
      captchaToken: captcha ?? undefined,
    });
    setLoading(false);
    turnstile.current?.reset();
    // Mismo mensaje exista o no la cuenta: si no, este formulario serviría para
    // averiguar qué emails tienen acceso al panel. Solo se muestran los errores
    // que no dependen de la cuenta (captcha, límite de envíos).
    if (error && ["captcha_failed", "over_email_send_rate_limit", "over_request_rate_limit"].includes(error.code ?? "")) {
      setError(t(authErrorKey(error)));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthAlert tone="success">
        <p className="font-medium">{t("forgotSentTitle")}</p>
        <p className="mt-1 text-muted">{t("forgotSentBody", { email: email.trim() })}</p>
      </AuthAlert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <AuthAlert tone="danger">{error}</AuthAlert>}
      <div>
        <AuthLabel htmlFor="email">{t("email")}</AuthLabel>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authInputCls}
          placeholder={t("emailPlaceholder")}
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <Turnstile ref={turnstile} onToken={setCaptcha} />
      <button
        type="submit"
        disabled={loading || !email.trim() || (needsCaptcha && !captcha)}
        className={authButtonCls}
      >
        {loading ? (
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
        ) : (
          <Mail size={18} aria-hidden />
        )}
        {t("forgotSubmit")}
      </button>
    </form>
  );
}

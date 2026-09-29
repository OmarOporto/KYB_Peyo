"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { authErrorKey } from "@/lib/auth/authErrors";
import { AuthAlert, AuthLabel, authButtonCls, authInputCls } from "./authUi";

/**
 * Paso del código de 6 dígitos (TOTP). Sube la sesión a aal2.
 *
 * `redirectTo`: a dónde ir después. Sin él se refresca la página, que ya con
 * aal2 muestra lo siguiente (p. ej. el reset de contraseña).
 */
export function MfaForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    // `totp` trae solo los verificados.
    const factor = factors?.totp[0];
    if (listErr || !factor) {
      setLoading(false);
      setError(t(authErrorKey(listErr)));
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      setLoading(false);
      setCode("");
      setError(t(authErrorKey(error)));
      return;
    }
    if (redirectTo) router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <AuthAlert tone="danger">{error}</AuthAlert>}
      <div>
        <AuthLabel htmlFor="mfa-code">{t("mfaCode")}</AuthLabel>
        <input
          id="mfa-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="000000"
          autoFocus
          className={`${authInputCls} text-center font-mono text-2xl tracking-[0.5em]`}
        />
      </div>
      <button type="submit" disabled={loading || code.length !== 6} className={authButtonCls}>
        {loading ? (
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
        ) : (
          <ShieldCheck size={18} aria-hidden />
        )}
        {t("mfaVerify")}
      </button>
    </form>
  );
}

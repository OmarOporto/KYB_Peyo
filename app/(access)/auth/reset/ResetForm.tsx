"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRound, LoaderCircle } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { authErrorKey } from "@/lib/auth/authErrors";
import { AuthAlert, authButtonCls } from "@/components/auth/authUi";
import { NewPasswordFields, newPasswordReady } from "@/components/auth/NewPasswordFields";

export function ResetForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newPasswordReady(password, confirm)) return;
    setLoading(true);
    setError(null);
    const { error } = await createBrowserSupabase().auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setError(t(authErrorKey(error)));
      return;
    }
    // La sesión del link ya es válida: directo al panel.
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && <AuthAlert tone="danger">{error}</AuthAlert>}
      <NewPasswordFields
        password={password}
        confirm={confirm}
        onPassword={setPassword}
        onConfirm={setConfirm}
      />
      <button
        type="submit"
        disabled={loading || !newPasswordReady(password, confirm)}
        className={authButtonCls}
      >
        {loading ? (
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
        ) : (
          <KeyRound size={18} aria-hidden />
        )}
        {t("savePassword")}
      </button>
    </form>
  );
}

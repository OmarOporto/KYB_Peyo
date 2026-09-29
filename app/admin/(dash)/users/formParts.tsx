"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { inputCls } from "@/components/ui/Field";
import { PasswordInput } from "@/components/auth/PasswordInput";
import type { AccountResult } from "./guards";

export type AdminOption = { userId: string; email: string; fullName: string | null };

/** Admin a contactar que verá el suspendido (por defecto, quien suspende). */
export function ContactSelect({
  admins,
  value,
  onChange,
  id,
}: {
  admins: AdminOption[];
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const t = useTranslations("accounts");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {t("contact")}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {admins.map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.fullName ? `${a.fullName} · ${a.email}` : a.email}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted">{t("contactHint")}</p>
    </div>
  );
}

/** "Tu contraseña": se vuelve a pedir para las acciones sensibles. */
export function StepUpInput({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  const t = useTranslations("accounts");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {t("stepUp")}
      </label>
      <PasswordInput
        id={id}
        size="md"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="current-password"
      />
      <p className="mt-1 text-xs text-muted">{t("stepUpHint")}</p>
    </div>
  );
}

/**
 * Corre una acción de cuentas y deja el resultado para mostrar: mensaje de
 * éxito o el error traducido (las acciones devuelven claves de i18n).
 */
export function useAccountAction() {
  const tAll = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(fn: () => Promise<AccountResult>, okText: string): Promise<boolean> {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setFeedback({ tone: "error", text: tAll(res.error) });
        return false;
      }
      setFeedback({ tone: "ok", text: okText });
      router.refresh();
      return true;
    } catch {
      setFeedback({ tone: "error", text: tAll("auth.errGeneric") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, feedback, setFeedback, run };
}

export function Feedback({ feedback }: { feedback: { tone: "ok" | "error"; text: string } | null }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.tone === "error" ? "alert" : "status"}
      className={`text-sm ${feedback.tone === "error" ? "text-danger" : "text-success"}`}
    >
      {feedback.text}
    </p>
  );
}

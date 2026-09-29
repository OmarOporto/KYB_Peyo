"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { MIN_PASSWORD_LENGTH, passwordIssues, type PasswordRule } from "@/lib/auth/passwordPolicy";
import { AuthLabel } from "./authUi";
import { PasswordInput } from "./PasswordInput";

/**
 * Contraseña nueva + repetición, con las reglas a la vista mientras se escribe.
 * Las reglas son las de Supabase (lib/auth/passwordPolicy.ts): el server las
 * vuelve a exigir, esto solo evita el ida y vuelta.
 */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  const t = useTranslations("auth");
  const issues = new Set(passwordIssues(password));
  const rules: { rule: PasswordRule; label: string }[] = [
    { rule: "length", label: t("ruleLength", { n: MIN_PASSWORD_LENGTH }) },
    { rule: "letter", label: t("ruleLetter") },
    { rule: "digit", label: t("ruleDigit") },
  ];
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <>
      <div>
        <AuthLabel htmlFor="new-password">{t("newPassword")}</AuthLabel>
        <PasswordInput
          id="new-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <ul className="mt-2 space-y-1">
          {rules.map(({ rule, label }) => {
            const ok = password.length > 0 && !issues.has(rule);
            return (
              <li
                key={rule}
                className={`flex items-center gap-2 text-sm ${ok ? "text-success" : "text-muted"}`}
              >
                {ok ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                {label}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <AuthLabel htmlFor="confirm-password">{t("confirmPassword")}</AuthLabel>
        <PasswordInput
          id="confirm-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          autoComplete="new-password"
          aria-invalid={mismatch}
          required
        />
        {mismatch && <p className="mt-1.5 text-sm text-danger">{t("passwordMismatch")}</p>}
      </div>
    </>
  );
}

/** ¿Se puede enviar? Misma regla que muestra el componente. */
export function newPasswordReady(password: string, confirm: string): boolean {
  return passwordIssues(password).length === 0 && password === confirm;
}

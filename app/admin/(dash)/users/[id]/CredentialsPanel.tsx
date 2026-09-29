"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";
import { NewPasswordFields, newPasswordReady } from "@/components/auth/NewPasswordFields";
import type { AccountRow } from "@/lib/auth/accounts";
import {
  cancelInviteAction,
  changeEmailAction,
  resendInviteAction,
  sendResetLinkAction,
  setPasswordAction,
} from "../credentialActions";
import { Feedback, StepUpInput, useAccountAction } from "../formParts";
import { Section } from "./AccountPanels";

/**
 * Credenciales de otra cuenta. Qué se ofrece depende de la cuenta (mismas
 * reglas que canManageAccount, que el server vuelve a aplicar):
 * - invitación pendiente → reenviar o cancelar;
 * - activa → link para restablecer la contraseña (también a otro admin);
 * - usuario (no admin) → definir contraseña y cambiar email.
 */
export function CredentialsPanel({ account }: { account: AccountRow }) {
  const isAdmin = account.role === "admin";
  return (
    <>
      <AccessSection account={account} />
      {!isAdmin && <EmailSection account={account} />}
    </>
  );
}

function AccessSection({ account }: { account: AccountRow }) {
  const t = useTranslations("accounts");
  const suspended = account.status === "suspended";
  const isAdmin = account.role === "admin";

  return (
    <Section title={t("accessTitle")} description={t("accessDescription")}>
      <div className="space-y-4">
        {account.pending ? <InviteBlock account={account} /> : <ResetLinkBlock account={account} />}
        {suspended ? (
          <p className="text-sm text-muted">{t("suspendedNote")}</p>
        ) : isAdmin ? (
          <p className="text-sm text-muted">{t("otherAdminNote")}</p>
        ) : (
          <SetPasswordBlock account={account} />
        )}
      </div>
    </Section>
  );
}

function InviteBlock({ account }: { account: AccountRow }) {
  const t = useTranslations("accounts");
  const tAll = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const resend = useAccountAction();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function onCancel() {
    setCancelling(true);
    setCancelError(null);
    const res = await cancelInviteAction(account.userId).catch(() => ({ ok: false as const, error: "auth.errGeneric" }));
    if (res.ok) {
      // La cuenta ya no existe: volver a la lista.
      router.replace("/admin/users");
      return;
    }
    setCancelError(tAll(res.error));
    setCancelling(false);
  }

  return (
    <div>
      <p className="text-sm text-foreground">
        {account.invitedAt
          ? t("invitePending", { date: format.dateTime(new Date(account.invitedAt), { dateStyle: "medium", timeStyle: "short" }) })
          : t("invitePendingNoDate")}
      </p>
      {!confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={resend.busy}
            onClick={() => resend.run(() => resendInviteAction(account.userId), t("inviteResent"))}
          >
            {t("resendInvite")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            {t("cancelInvite")}
          </Button>
          <Feedback feedback={resend.feedback} />
        </div>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-sm text-foreground">{t("cancelInviteWarning", { email: account.email })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="danger" size="sm" disabled={cancelling} onClick={onCancel}>
              {t("cancelInvite")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t("back")}
            </Button>
          </div>
          {cancelError && <Feedback feedback={{ tone: "error", text: cancelError }} />}
        </div>
      )}
    </div>
  );
}

function ResetLinkBlock({ account }: { account: AccountRow }) {
  const t = useTranslations("accounts");
  const action = useAccountAction();
  const suspended = account.status === "suspended";
  return (
    <div>
      <p className="text-sm text-muted">{t("resetLinkHint")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={action.busy || suspended}
          onClick={() =>
            action.run(() => sendResetLinkAction(account.userId), t("resetLinkSent", { email: account.email }))
          }
        >
          {t("sendResetLink")}
        </Button>
        <Feedback feedback={action.feedback} />
      </div>
    </div>
  );
}

function SetPasswordBlock({ account }: { account: AccountRow }) {
  const t = useTranslations("accounts");
  const action = useAccountAction();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stepUpPassword, setStepUpPassword] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await action.run(
      () => setPasswordAction(account.userId, password, stepUpPassword),
      t("passwordSet"),
    );
    if (ok) {
      setPassword("");
      setConfirm("");
      setStepUpPassword("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <div className="border-t border-border pt-4">
        <p className="text-sm text-muted">{account.pending ? t("setPasswordPendingHint") : t("setPasswordHint")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("setPassword")}
          </Button>
          <Feedback feedback={action.feedback} />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 border-t border-border pt-4">
      <p className="text-sm text-muted">{account.pending ? t("setPasswordPendingHint") : t("setPasswordHint")}</p>
      <NewPasswordFields
        password={password}
        confirm={confirm}
        onPassword={setPassword}
        onConfirm={setConfirm}
        size="md"
      />
      <StepUpInput id="pw-stepup" value={stepUpPassword} onChange={setStepUpPassword} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={action.busy || !newPasswordReady(password, confirm) || !stepUpPassword}
        >
          {t("setPassword")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
        <Feedback feedback={action.feedback} />
      </div>
    </form>
  );
}

function EmailSection({ account }: { account: AccountRow }) {
  const t = useTranslations("accounts");
  const action = useAccountAction();
  const [email, setEmail] = useState("");
  const [stepUpPassword, setStepUpPassword] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await action.run(
      () => changeEmailAction(account.userId, email, stepUpPassword),
      t("emailChanged"),
    );
    if (ok) {
      setEmail("");
      setStepUpPassword("");
    }
  }

  return (
    <Section
      title={t("emailTitle")}
      description={account.pending ? t("emailPendingDescription") : t("emailDescription")}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label htmlFor="acc-email" className="mb-1 block text-sm font-medium text-foreground">
            {t("newEmail")}
          </label>
          <input
            id="acc-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={account.email}
            autoComplete="off"
            className={inputCls}
            maxLength={254}
          />
        </div>
        {email.trim() && <StepUpInput id="email-stepup" value={stepUpPassword} onChange={setStepUpPassword} />}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={action.busy || !email.trim() || !stepUpPassword}>
            {t("changeEmail")}
          </Button>
          <Feedback feedback={action.feedback} />
        </div>
      </form>
    </Section>
  );
}

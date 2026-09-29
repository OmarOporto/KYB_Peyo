"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";
import type { AccountRow } from "@/lib/auth/accounts";
import type { OrgOption } from "@/lib/auth/tenant";
import type { Role } from "@/lib/auth/accountRules";
import { reactivateAccountAction, suspendAccountAction, updateAccountAction } from "../actions";
import {
  ContactSelect,
  Feedback,
  StepUpInput,
  useAccountAction,
  type AdminOption,
} from "../formParts";

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-0.5 mb-4 text-sm text-muted">{description}</p>}
      {!description && <div className="mb-3" />}
      {children}
    </Card>
  );
}

/**
 * Datos y estado de otra cuenta. Las credenciales (email, contraseña,
 * invitación) van en CredentialsPanel.
 */
export function AccountPanels({
  account,
  orgs,
  admins,
  actorId,
  canManage,
  children,
}: {
  account: AccountRow;
  orgs: OrgOption[];
  admins: AdminOption[];
  actorId: string;
  canManage: boolean;
  /** Paneles extra (credenciales), entre datos y estado. */
  children?: ReactNode;
}) {
  const t = useTranslations("accounts");
  if (!canManage) {
    return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{t("needs2fa")}</p>;
  }
  return (
    <div className="space-y-4">
      <ProfileSection account={account} orgs={orgs} />
      {children}
      <StateSection account={account} admins={admins} actorId={actorId} />
    </div>
  );
}

function ProfileSection({ account, orgs }: { account: AccountRow; orgs: OrgOption[] }) {
  const t = useTranslations("accounts");
  const action = useAccountAction();
  const [fullName, setFullName] = useState(account.fullName ?? "");
  const [role, setRole] = useState<Role>(account.role);
  const [orgId, setOrgId] = useState(account.orgId);
  const [password, setPassword] = useState("");
  const promoting = role === "admin" && account.role !== "admin";
  const changed =
    fullName.trim() !== (account.fullName ?? "") || role !== account.role || orgId !== account.orgId;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await action.run(
      () => updateAccountAction(account.userId, { fullName, role, orgId }, promoting ? password : undefined),
      t("saved"),
    );
    if (ok) setPassword("");
  }

  return (
    <Section title={t("profileTitle")} description={t("profileDescription")}>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="acc-name" className="mb-1 block text-sm font-medium text-foreground">
            {t("fullName")}
          </label>
          <input
            id="acc-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
            maxLength={120}
          />
        </div>
        <div>
          <label htmlFor="acc-role" className="mb-1 block text-sm font-medium text-foreground">
            {t("role")}
          </label>
          <select
            id="acc-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={inputCls}
          >
            <option value="analyst">{t("roleUser")}</option>
            <option value="admin">{t("roleAdmin")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="acc-org" className="mb-1 block text-sm font-medium text-foreground">
            {t("org")}
          </label>
          <select id="acc-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} className={inputCls}>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        {promoting && (
          <div className="sm:col-span-2">
            <p className="mb-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-sm text-foreground">
              {t("promoteWarning")}
            </p>
            <StepUpInput id="acc-stepup" value={password} onChange={setPassword} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" disabled={action.busy || !changed || (promoting && !password)}>
            {t("save")}
          </Button>
          <Feedback feedback={action.feedback} />
        </div>
      </form>
    </Section>
  );
}

function StateSection({
  account,
  admins,
  actorId,
}: {
  account: AccountRow;
  admins: AdminOption[];
  actorId: string;
}) {
  const t = useTranslations("accounts");
  const action = useAccountAction();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState(
    admins.some((a) => a.userId === actorId) ? actorId : (admins[0]?.userId ?? ""),
  );
  const [password, setPassword] = useState("");
  const suspended = account.status === "suspended";

  if (suspended) {
    return (
      <Section title={t("stateTitle")} description={t("suspendedSince", { email: account.contactEmail ?? "—" })}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            action.run(
              () => reactivateAccountAction(account.userId, account.role === "admin" ? password : undefined),
              t("reactivated"),
            );
          }}
        >
          {account.role === "admin" && (
            <StepUpInput id="react-stepup" value={password} onChange={setPassword} />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={action.busy || (account.role === "admin" && !password)}
            >
              {t("reactivate")}
            </Button>
            <Feedback feedback={action.feedback} />
          </div>
        </form>
      </Section>
    );
  }

  return (
    <Section title={t("stateTitle")} description={t("stateDescription")}>
      {!open ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t("suspend")}
          </Button>
          <Feedback feedback={action.feedback} />
        </div>
      ) : (
        <form
          className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action.run(() => suspendAccountAction(account.userId, contact), t("suspendedOk"))) {
              setOpen(false);
            }
          }}
        >
          <p className="text-sm text-foreground">{t("suspendWarning", { email: account.email })}</p>
          <ContactSelect id="acc-contact" admins={admins} value={contact} onChange={setContact} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={action.busy || !contact}>
              {t("suspendConfirm")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
          <Feedback feedback={action.feedback} />
        </form>
      )}
    </Section>
  );
}

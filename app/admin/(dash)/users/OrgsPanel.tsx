"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputCls } from "@/components/ui/Field";
import type { OrgSummary } from "@/lib/auth/accounts";
import {
  createOrgAction,
  reactivateOrgAction,
  renameOrgAction,
  suspendOrgAction,
} from "./actions";
import { ContactSelect, Feedback, useAccountAction, type AdminOption } from "./formParts";

export function OrgsPanel({
  orgs,
  admins,
  canManage,
  actorId,
}: {
  orgs: OrgSummary[];
  admins: AdminOption[];
  canManage: boolean;
  actorId: string;
}) {
  const t = useTranslations("accounts");
  const create = useAccountAction();
  const [name, setName] = useState("");

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (await create.run(() => createOrgAction(name), t("orgCreated"))) setName("");
  }

  return (
    <>
      {canManage && (
        <Card className="mb-4 p-4">
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
            <div className="min-w-60 flex-1">
              <label htmlFor="new-org" className="mb-1 block text-sm font-medium text-foreground">
                {t("newOrg")}
              </label>
              <input
                id="new-org"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("newOrgPlaceholder")}
                className={inputCls}
                maxLength={120}
              />
            </div>
            <Button type="submit" size="sm" disabled={create.busy || name.trim().length < 2}>
              {t("createOrg")}
            </Button>
          </form>
          <div className="mt-2">
            <Feedback feedback={create.feedback} />
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {orgs.map((o) => (
          <OrgRow key={o.id} org={o} admins={admins} canManage={canManage} actorId={actorId} />
        ))}
      </div>
    </>
  );
}

function OrgRow({
  org,
  admins,
  canManage,
  actorId,
}: {
  org: OrgSummary;
  admins: AdminOption[];
  canManage: boolean;
  actorId: string;
}) {
  const t = useTranslations("accounts");
  const action = useAccountAction();
  const [mode, setMode] = useState<"idle" | "rename" | "suspend">("idle");
  const [name, setName] = useState(org.name);
  const [contact, setContact] = useState(
    admins.some((a) => a.userId === actorId) ? actorId : (admins[0]?.userId ?? ""),
  );
  const suspended = Boolean(org.suspendedAt);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {org.name}
            <span className="font-mono text-xs text-muted">{org.slug}</span>
            {suspended && (
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">
                {t("status_suspended")}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {t("orgStats", { users: org.users, admins: org.activeAdmins, keys: org.apiKeys })}
            {suspended && org.contactEmail && ` · ${t("contactShort")}: ${org.contactEmail}`}
          </p>
        </div>
        {canManage && mode === "idle" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode("rename")}>
              {t("rename")}
            </Button>
            {suspended ? (
              <Button
                variant="outline"
                size="sm"
                disabled={action.busy}
                onClick={() => action.run(() => reactivateOrgAction(org.id), t("orgReactivated"))}
              >
                {t("reactivate")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                // Con admins adentro la base lo rechazaría igual (0028).
                disabled={org.activeAdmins > 0}
                title={org.activeAdmins > 0 ? t("errOrgHasAdmins") : undefined}
                onClick={() => setMode("suspend")}
              >
                {t("suspend")}
              </Button>
            )}
          </div>
        )}
      </div>

      {mode === "rename" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action.run(() => renameOrgAction(org.id, name), t("orgRenamed"))) setMode("idle");
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} max-w-sm`}
            aria-label={t("orgName")}
            maxLength={120}
          />
          <Button type="submit" size="sm" disabled={action.busy || name.trim().length < 2}>
            {t("save")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
            {t("cancel")}
          </Button>
        </form>
      )}

      {mode === "suspend" && (
        <form
          className="mt-3 space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await action.run(() => suspendOrgAction(org.id, contact), t("orgSuspended"))) setMode("idle");
          }}
        >
          <p className="text-sm text-foreground">{t("suspendOrgWarning", { org: org.name })}</p>
          <ContactSelect id={`contact-${org.id}`} admins={admins} value={contact} onChange={setContact} />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={action.busy || !contact}>
              {t("suspendOrgConfirm")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("idle")}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-2">
        <Feedback feedback={action.feedback} />
      </div>
    </Card>
  );
}

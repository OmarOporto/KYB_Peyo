import { useTranslations } from "next-intl";
import type { AccountStatus } from "@/lib/auth/accounts";
import type { Role } from "@/lib/auth/accountRules";

/** Sin "use client": sirven en la página (server) y en los paneles (client). */

const STATUS_CLS: Record<AccountStatus, string> = {
  active: "bg-success/15 text-success",
  invited: "bg-brand/10 text-brand",
  suspended: "bg-danger/15 text-danger",
  orgSuspended: "bg-warning/15 text-warning",
};

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const t = useTranslations("accounts");
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_CLS[status]}`}>
      {t(`status_${status}`)}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const t = useTranslations("accounts");
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
        role === "admin" ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted"
      }`}
    >
      {t(role === "admin" ? "roleAdmin" : "roleUser")}
    </span>
  );
}

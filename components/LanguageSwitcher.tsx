"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import { locales, localeNames, type Locale } from "@/i18n/config";

export function LanguageSwitcher() {
  const active = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <select
      aria-label="Language"
      value={active}
      onChange={onChange}
      disabled={pending}
      className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground outline-none transition-colors hover:bg-surface-2 focus:border-brand disabled:opacity-50"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {localeNames[l]}
        </option>
      ))}
    </select>
  );
}

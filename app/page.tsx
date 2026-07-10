import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/Button";

export default async function Home() {
  const t = await getTranslations("landing");
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-6 px-6 py-20">
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          {t("badge")}
        </span>
        <h1 className="font-display text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
          {t("titleLine1")}
          <br />
          <span className="bg-linear-to-r from-brand to-accent bg-clip-text text-transparent">
            {t("titleHighlight")}
          </span>
        </h1>
        <p className="max-w-xl text-lg text-muted">{t("subtitle")}</p>
        <div className="flex gap-3">
          <Link href="/admin">
            <Button>{t("reviewPanel")}</Button>
          </Link>
        </div>
      </main>
    </>
  );
}

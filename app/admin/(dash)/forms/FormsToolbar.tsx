"use client";

import { useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { createForm, importFormJson } from "./actions";

export function FormsToolbar() {
  const t = useTranslations("forms");
  const [showImport, setShowImport] = useState(false);
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onImport() {
    setBusy(true);
    setError(null);
    const res = await importFormJson(json);
    setBusy(false);
    if (res && !res.ok) setError(res.error);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-seleccionar el mismo archivo
    if (!file) return;
    setError(null);
    try {
      setJson(await file.text());
    } catch {
      setError(t("readError"));
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form action={createForm}>
        <Button type="submit">{t("newForm")}</Button>
      </form>
      <Button variant="outline" onClick={() => setShowImport((s) => !s)}>
        {t("importJson")}
      </Button>

      {showImport && (
        <div className="mt-2 w-full">
          <p className="mb-1 text-sm text-muted">{t("importHint")}</p>
          <label className="mb-2 inline-flex cursor-pointer items-center gap-2">
            <span className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
              {t("chooseFile")}
            </span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={onFile}
              aria-label={t("chooseFile")}
              className="hidden"
            />
          </label>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{ "version": 1, "title": {...}, "sections": [...] }'
            rows={6}
            className="w-full rounded-lg border border-border bg-surface p-2 font-mono text-xs text-foreground outline-none focus:border-brand"
          />
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={onImport} disabled={busy || !json.trim()}>
              {busy ? "…" : t("import")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

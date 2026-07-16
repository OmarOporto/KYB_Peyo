"use client";

import { useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { uploadFormImageAction } from "@/app/admin/(dash)/forms/actions";

/** Control de subida de imagen de ayuda (usado en el builder). */
export function ImageUpload({
  value,
  onChange,
  label,
  size = "md",
}: {
  value?: string;
  onChange: (url?: string) => void;
  label?: string;
  size?: "sm" | "md";
}) {
  const t = useTranslations("builder");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadFormImageAction(fd);
    setBusy(false);
    if (res.ok) {
      onChange(res.url);
    } else {
      setErr(
        res.error === "size"
          ? t("imageTooLarge")
          : res.error === "type"
            ? t("imageInvalidType")
            : t("imageError"),
      );
    }
  }

  const thumb = size === "sm" ? "h-10 w-10" : "h-20 w-20";

  return (
    <div className="mt-2">
      {label && <p className="mb-1 text-xs font-medium text-muted">{label}</p>}
      {value ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className={`${thumb} rounded border border-border object-cover`}
          />
          <button
            type="button"
            className="cursor-pointer text-xs text-danger hover:underline"
            onClick={() => onChange(undefined)}
          >
            {t("removeImage")}
          </button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2">
          <span className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted hover:border-brand">
            {busy ? "…" : t("uploadImage")}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
            disabled={busy}
          />
        </label>
      )}
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

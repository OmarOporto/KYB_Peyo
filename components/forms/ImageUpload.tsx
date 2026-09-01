"use client";

import { useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { uploadFormImageAction } from "@/app/admin/(dash)/forms/actions";
import type { ImageSize } from "@/lib/forms/definition";

// Mismas clases que `smallInput` del builder (FormBuilder.tsx), duplicadas
// porque aquella es una constante local no exportada.
const smallSelect =
  "rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/** Control de subida de imagen de ayuda (usado en el builder). */
export function ImageUpload({
  value,
  onChange,
  label,
  size = "md",
  imageSize,
  onImageSizeChange,
}: {
  value?: string;
  onChange: (url?: string) => void;
  label?: string;
  /** Tamaño de la MINIATURA del editor. No es lo que ve el solicitante. */
  size?: "sm" | "md";
  /** Tamaño con el que se renderiza la imagen AL SOLICITANTE. */
  imageSize?: ImageSize;
  /** Si se pasa, se muestra el selector de tamaño. */
  onImageSizeChange?: (s: ImageSize) => void;
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
          {onImageSizeChange && (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
              {t("imageSize")}
              <select
                className={smallSelect}
                value={imageSize ?? "md"}
                onChange={(e) => onImageSizeChange(e.target.value as ImageSize)}
              >
                <option value="sm">{t("imageSizeSm")}</option>
                <option value="md">{t("imageSizeMd")}</option>
                <option value="lg">{t("imageSizeLg")}</option>
                <option value="full">{t("imageSizeFull")}</option>
              </select>
            </label>
          )}
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

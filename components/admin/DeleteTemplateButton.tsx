"use client";

import { useTranslations } from "next-intl";
import { deleteTemplate } from "@/app/admin/(dash)/templates/actions";

export function DeleteTemplateButton({ id }: { id: string }) {
  const t = useTranslations("templates");

  return (
    <form
      action={deleteTemplate.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm(t("confirmDelete"))) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
      >
        {t("delete")}
      </button>
    </form>
  );
}

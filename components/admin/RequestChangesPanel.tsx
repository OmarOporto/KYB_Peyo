"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { requestChangesAction } from "@/app/admin/actions";

export type CorrectableField = { key: string; label: string; section: string };

/**
 * Panel del analista para devolver una solicitud al solicitante y pedir que
 * corrija preguntas puntuales: selecciona campos, escribe una nota por campo, y
 * al enviar borra sus respuestas y re-emite el link (que se muestra al final).
 */
export function RequestChangesPanel({
  requestId,
  fields,
}: {
  requestId: string;
  fields: CorrectableField[];
}) {
  const t = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);

  const chosen = fields.filter((f) => selected[f.key]);

  async function onSubmit() {
    if (chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await requestChangesAction(
        requestId,
        chosen.map((f) => ({ key: f.key, note: notes[f.key] ?? "" })),
      );
      if (res.ok) {
        setInvitationUrl(res.invitationUrl);
      } else {
        setError(res.error);
      }
    } catch {
      setError(t("requestChangesError"));
    } finally {
      setBusy(false);
    }
  }

  if (invitationUrl) {
    return (
      <Card className="mt-3 p-4">
        <p className="text-sm font-medium text-foreground">{t("changesSent")}</p>
        <p className="mt-1 text-xs text-muted">{t("changesSentBody")}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground">
            {invitationUrl}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard?.writeText(invitationUrl)}
          >
            {t("copyLink")}
          </Button>
        </div>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t("requestChanges")}
      </Button>
    );
  }

  return (
    <Card className="mt-1 w-full p-4">
      <p className="mb-1 text-sm font-medium text-foreground">{t("requestChanges")}</p>
      <p className="mb-3 text-xs text-muted">{t("selectFields")}</p>
      <div className="space-y-2">
        {fields.map((f) => {
          const isOn = !!selected[f.key];
          return (
            <div key={f.key} className="rounded-lg border border-border p-2">
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={isOn}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [f.key]: e.target.checked }))
                  }
                />
                <span>
                  {f.label}
                  <span className="ml-2 text-xs text-muted">{f.section}</span>
                </span>
              </label>
              {isOn && (
                <textarea
                  className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-brand"
                  rows={2}
                  value={notes[f.key] ?? ""}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [f.key]: e.target.value }))
                  }
                  placeholder={t("notePlaceholder")}
                />
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button onClick={onSubmit} disabled={busy || chosen.length === 0}>
          {t("sendCorrections")}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
          {t("cancel")}
        </Button>
      </div>
    </Card>
  );
}

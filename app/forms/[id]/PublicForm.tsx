"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { startPublicIntake } from "./actions";

/**
 * Entrada del intake público de un formulario publicado. Al comenzar, crea una
 * solicitud real y redirige al flujo por token (`/f/[token]`), que persiste el
 * borrador, las subidas y el submit. Ya no es una vista previa: recolecta
 * respuestas de verdad. La vista previa pura vive en el editor del formulario.
 */
export function PublicForm({ formId }: { formId: string }) {
  const t = useTranslations("form");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onStart() {
    setError(null);
    startTransition(async () => {
      // En éxito, la action redirige (no retorna). Solo llega aquí en error.
      const res = await startPublicIntake(formId);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <Card className="p-6">
      <p className="text-muted">{t("startBody")}</p>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <div className="mt-6">
        <Button type="button" onClick={onStart} disabled={pending}>
          {pending ? t("submitting") : t("start")}
        </Button>
      </div>
    </Card>
  );
}

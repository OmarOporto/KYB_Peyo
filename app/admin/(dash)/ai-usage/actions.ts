"use server";

import { revalidatePath } from "next/cache";
import { getAnalyst } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/kyb/service";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Actualiza la tarifa de un modelo. **Solo rol `admin`**: el cambio afecta el
 * costo registrado de todo lo que se traduzca a partir de acá.
 *
 * Las corridas ya registradas conservan la tarifa que se les aplicó (columnas
 * `input_per_1m` / `output_per_1m` de `ai_usage`), así que esto nunca reescribe
 * el historial.
 *
 * Una Server Action es un endpoint POST alcanzable por cualquiera que sepa su
 * id, así que el permiso se verifica acá dentro y no solo en la UI.
 */
export async function setModelPriceAction(
  model: string,
  inputPer1M: number,
  outputPer1M: number,
): Promise<Result> {
  const analyst = await getAnalyst();
  if (!analyst) return { ok: false, error: "No autenticado." };
  if (analyst.role !== "admin") {
    return { ok: false, error: "Solo un administrador puede cambiar tarifas." };
  }

  const name = model.trim();
  if (!name) return { ok: false, error: "El modelo es requerido." };
  if (!Number.isFinite(inputPer1M) || inputPer1M < 0) {
    return { ok: false, error: "Tarifa de entrada inválida." };
  }
  if (!Number.isFinite(outputPer1M) || outputPer1M < 0) {
    return { ok: false, error: "Tarifa de salida inválida." };
  }

  const supabase = createServiceClient();
  const { data: prev } = await supabase
    .from("ai_model_prices")
    .select("input_per_1m, output_per_1m")
    .eq("model", name)
    .maybeSingle();

  const { error } = await supabase.from("ai_model_prices").upsert(
    {
      model: name,
      input_per_1m: inputPer1M,
      output_per_1m: outputPer1M,
      updated_at: new Date().toISOString(),
      updated_by: analyst.email,
    },
    { onConflict: "model" },
  );
  if (error) return { ok: false, error: error.message };

  // Rastro de quién cambió qué tarifa: el costo de todas las corridas futuras
  // depende de este número.
  await logAudit({
    requestId: null,
    actor: analyst.email,
    action: "ai_price_updated",
    metadata: {
      model: name,
      from: prev
        ? { input: Number(prev.input_per_1m), output: Number(prev.output_per_1m) }
        : null,
      to: { input: inputPer1M, output: outputPer1M },
    },
  });

  revalidatePath("/admin/ai-usage");
  return { ok: true };
}

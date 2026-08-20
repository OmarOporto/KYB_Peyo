import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  computeCost,
  DEFAULT_CURRENCY,
  DEFAULT_PRICES,
  type ModelPrice,
} from "./pricing";

export type AiOperation = "form_translate" | "answer_translate";

export interface AiUsageEntry {
  runId: string;
  operation: AiOperation;
  provider: string;
  model: string;
  fromLocale?: string;
  toLocale?: string;
  items: number;
  itemsReturned: number;
  inputTokens: number;
  outputTokens: number;
  actor: string;
  formId?: string | null;
  requestId?: string | null;
}

export interface AiUsageResult {
  inputTokens: number;
  outputTokens: number;
  inputPer1M: number | null;
  outputPer1M: number | null;
  cost: number | null;
  currency: string;
  model: string;
  provider: string;
}

/**
 * Tarifa vigente de un modelo: la tabla manda, el código es respaldo.
 * El proveedor `mock` no consume tokens, así que no tiene tarifa.
 */
async function resolvePrice(model: string, provider: string): Promise<ModelPrice | null> {
  if (provider === "mock") return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("ai_model_prices")
    .select("input_per_1m, output_per_1m, currency")
    .eq("model", model)
    .maybeSingle();

  if (data) {
    return {
      inputPer1M: Number(data.input_per_1m),
      outputPer1M: Number(data.output_per_1m),
      currency: (data.currency as string) ?? DEFAULT_CURRENCY,
    };
  }
  return DEFAULT_PRICES[model] ?? null;
}

/**
 * Registra una llamada al proveedor y devuelve el costo calculado para que el
 * llamador lo muestre.
 *
 * **Nunca lanza.** Se invoca DESPUÉS de una traducción que ya se pagó: fallar
 * acá por un problema de contabilidad perdería el trabajo. Si el registro no se
 * puede escribir, se loguea y se devuelven igual los números calculados.
 */
export async function recordAiUsage(entry: AiUsageEntry): Promise<AiUsageResult> {
  const price = await resolvePrice(entry.model, entry.provider).catch(() => null);
  const cost = computeCost(entry.inputTokens, entry.outputTokens, price);
  const currency = price?.currency ?? DEFAULT_CURRENCY;

  const result: AiUsageResult = {
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    inputPer1M: price?.inputPer1M ?? null,
    outputPer1M: price?.outputPer1M ?? null,
    cost,
    currency,
    model: entry.model,
    provider: entry.provider,
  };

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("ai_usage").insert({
      run_id: entry.runId,
      operation: entry.operation,
      provider: entry.provider,
      model: entry.model,
      from_locale: entry.fromLocale ?? null,
      to_locale: entry.toLocale ?? null,
      items: entry.items,
      items_returned: entry.itemsReturned,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      input_per_1m: price?.inputPer1M ?? null,
      output_per_1m: price?.outputPer1M ?? null,
      cost,
      currency,
      actor: entry.actor,
      form_id: entry.formId ?? null,
      request_id: entry.requestId ?? null,
    });
    if (error) console.error("[ai-usage] no se pudo registrar:", error.message);
  } catch (e) {
    console.error("[ai-usage] no se pudo registrar:", e instanceof Error ? e.message : e);
  }

  return result;
}

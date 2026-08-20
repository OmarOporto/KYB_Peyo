// ============================================================
// Tarifas por modelo — client-safe
// ------------------------------------------------------------
// Estos valores solo SIEMBRAN la tabla `ai_model_prices` y sirven de respaldo
// si se usa un modelo que nadie cargó. La fuente de verdad en runtime es la
// tabla, editable desde el panel: así una tarifa desactualizada se corrige sin
// desplegar.
//
// Cada fila de `ai_usage` congela la tarifa que se le aplicó, de modo que
// editar un precio nunca reescribe el historial.
//
// PRECIOS EN USD POR MILLÓN DE TOKENS. Verificar contra la página de precios de
// OpenAI antes de confiar en las cifras: cambian y este archivo no se entera.
// ============================================================

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  currency: string;
}

export const DEFAULT_CURRENCY = "USD";

export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0, currency: DEFAULT_CURRENCY },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6, currency: DEFAULT_CURRENCY },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4, currency: DEFAULT_CURRENCY },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0, currency: DEFAULT_CURRENCY },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6, currency: DEFAULT_CURRENCY },
};

/** Costo de una llamada. Devuelve `null` si no hay tarifa (p. ej. proveedor mock). */
export function computeCost(
  inputTokens: number,
  outputTokens: number,
  price: ModelPrice | null | undefined,
): number | null {
  if (!price) return null;
  const cost =
    (inputTokens / 1_000_000) * price.inputPer1M +
    (outputTokens / 1_000_000) * price.outputPer1M;
  // 6 decimales: una sección corta puede costar fracciones de centavo y
  // redondear antes de sumar perdería el total.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** `US$ 0.2431` — con suficientes decimales para que una corrida chica no dé 0. */
export function formatCost(cost: number | null | undefined, currency = DEFAULT_CURRENCY): string {
  if (cost == null) return "—";
  const decimals = cost > 0 && cost < 0.01 ? 4 : 2;
  return `${currency === "USD" ? "US$" : currency} ${cost.toFixed(decimals)}`;
}

/** `31.2k` — los conteos de tokens son largos y se leen mejor abreviados. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

// ============================================================
// Proveedor de traducción — contrato client-safe
// ------------------------------------------------------------
// Mismo patrón que lib/aml/provider.ts: los tipos y la interfaz son
// client-safe; las implementaciones (openai.ts, mock.ts) son server-only y se
// resuelven en lib/i18n-ai/index.ts según TRANSLATE_PROVIDER.
// ============================================================

/** Una unidad a traducir. `id` es el path estable (ver walk.ts). */
export interface TranslateItem {
  id: string;
  text: string;
  /** Contexto para desambiguar (sección, pregunta padre, tipo de campo). */
  hint?: string;
}

export interface TranslateResult {
  id: string;
  text: string;
  /**
   * `true` = no se debe traducir (nombre propio, código, número). El llamador
   * escribe el texto fuente en el locale destino: así cuenta como resuelto y
   * no se vuelve a mandar al modelo en cada pase.
   */
  keepSource: boolean;
}

export interface TranslateOptions {
  /** Locale de origen (BCP-47 corto: "es"). */
  from: string;
  /** Locale destino ("en"). */
  to: string;
}

export interface TranslateBatchResult {
  results: TranslateResult[];
  /** Tokens consumidos, si el proveedor los reporta. */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface TranslationProvider {
  readonly name: string;
  /** Identificador del modelo, para registrar procedencia. */
  readonly model: string;
  /**
   * Traduce un lote. Debe devolver un resultado por cada item recibido; el
   * llamador descarta ids desconocidos y trata los ausentes como no traducidos.
   */
  translateBatch(
    items: TranslateItem[],
    opts: TranslateOptions,
  ): Promise<TranslateBatchResult>;
}

/** Tope de items por llamada al proveedor. Lotes mayores se parten. */
export const MAX_ITEMS_PER_CALL = 80;

/** Parte un arreglo en trozos de a lo sumo `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

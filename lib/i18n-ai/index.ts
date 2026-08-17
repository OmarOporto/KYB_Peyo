import "server-only";
import { env } from "@/lib/env";
import { MockTranslationProvider } from "./mock";
import { OpenAiTranslationProvider } from "./openai";
import {
  chunk,
  MAX_ITEMS_PER_CALL,
  type TranslateBatchResult,
  type TranslateItem,
  type TranslateOptions,
  type TranslationProvider,
} from "./provider";

/**
 * Proveedor según `TRANSLATE_PROVIDER` (mock | openai). Mismo patrón que
 * `getAmlProvider()` en lib/aml/index.ts: el default es `mock` para que un
 * entorno sin configurar nunca gaste tokens por accidente.
 */
export function getTranslationProvider(): TranslationProvider {
  return env.translateProvider() === "openai"
    ? new OpenAiTranslationProvider()
    : new MockTranslationProvider();
}

/**
 * Traduce un lote de cualquier tamaño partiéndolo y corriendo los trozos en
 * paralelo. La paralelización va acá, del lado del servidor: la restricción de
 * despacho secuencial de Next 16 aplica solo al cliente
 * (node_modules/next/dist/docs/01-app/02-guides/server-actions.md).
 */
export async function translateAll(
  provider: TranslationProvider,
  items: TranslateItem[],
  opts: TranslateOptions,
): Promise<TranslateBatchResult> {
  const chunks = chunk(items, MAX_ITEMS_PER_CALL);
  const batches = await Promise.all(chunks.map((c) => provider.translateBatch(c, opts)));

  return {
    results: batches.flatMap((b) => b.results),
    usage: batches.reduce(
      (acc, b) => ({
        inputTokens: acc.inputTokens + (b.usage?.inputTokens ?? 0),
        outputTokens: acc.outputTokens + (b.usage?.outputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    ),
  };
}

export * from "./provider";

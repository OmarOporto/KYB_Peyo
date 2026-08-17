import "server-only";
import type {
  TranslateBatchResult,
  TranslateItem,
  TranslateOptions,
  TranslationProvider,
} from "./provider";

/** Códigos, números puros y snake_case: el proveedor real los deja intactos. */
const KEEP_SOURCE_RE = /^[\s\d.,%+/#-]+$|^[a-z0-9]+(?:_[a-z0-9]+)+$|^https?:\/\//i;

/**
 * Proveedor de desarrollo. No traduce: marca el texto con el locale destino
 * para que se vea de un golpe qué quedó cubierto y cómo respira el layout en
 * otro idioma, sin consumir tokens. Replica el comportamiento de `keepSource`
 * del proveedor real para poder probar ese camino.
 */
export class MockTranslationProvider implements TranslationProvider {
  readonly name = "mock";
  readonly model = "mock";

  async translateBatch(
    items: TranslateItem[],
    opts: TranslateOptions,
  ): Promise<TranslateBatchResult> {
    return {
      results: items.map((it) => {
        const keepSource = KEEP_SOURCE_RE.test(it.text.trim());
        return {
          id: it.id,
          text: keepSource ? it.text : `«${opts.to}» ${it.text}`,
          keepSource,
        };
      }),
    };
  }
}

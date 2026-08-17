// ============================================================
// Glosario y prompt de traducción KYB — client-safe
// ------------------------------------------------------------
// El CONTENIDO vive en glossary.json para que lo compartan este módulo y
// scripts/i18n-eval.mjs sin duplicarlo: el script mide exactamente el prompt
// que corre en producción. Acá solo está el armado.
//
// Los términos se derivaron de los pares ES/EN escritos a mano en
// lib/forms/presets/*.ts. Si cambiás algo, corré `npm run i18n:eval` para medir
// contra esos pares antes de darlo por bueno.
// ============================================================
import data from "./glossary.json";

/** Términos canónicos para un par de locales, o `null` si no hay. */
export function termsFor(from: string, to: string): Record<string, string> | null {
  const byTarget = (data.terms as Record<string, Record<string, Record<string, string>>>)[
    from
  ];
  return byTarget?.[to] ?? null;
}

export function hasGlossary(from: string, to: string): boolean {
  const t = termsFor(from, to);
  return Boolean(t && Object.keys(t).length);
}

/** Reglas de estilo + glosario. Bloque estable, cacheable como prefijo. */
export function glossaryPrompt(from: string, to: string): string {
  const lines: string[] = ["REGLAS DE ESTILO:"];
  for (const r of data.styleRules) lines.push(`- ${r}`);

  const terms = termsFor(from, to);
  if (terms) {
    lines.push("");
    lines.push(
      "GLOSARIO OBLIGATORIO (término origen => traducción canónica). Usá estas " +
        "equivalencias siempre que el término aparezca, ajustando número y " +
        "concordancia al contexto:",
    );
    for (const [src, dst] of Object.entries(terms)) lines.push(`- ${src} => ${dst}`);
  }
  return lines.join("\n");
}

/** Contrato de salida (ids, keepSource, hint). */
export function outputContract(): string {
  return ["CONTRATO DE SALIDA:", ...data.outputContract.map((l) => `- ${l}`)].join("\n");
}

/** Prompt de sistema completo. Única fuente: la usan el proveedor y el eval. */
export function systemPrompt(from: string, to: string): string {
  return [
    `Traducís textos de un formulario de onboarding empresarial (KYB/AML) de ${from} a ${to}.`,
    "",
    glossaryPrompt(from, to),
    "",
    outputContract(),
  ].join("\n");
}

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/kyb/service";
import { resolveText, type FormDefinition } from "@/lib/forms/definition";
import { getTranslationProvider, translateAll } from "./index";
import { recordAiUsage } from "./usage";
import type { TranslateItem } from "./provider";

/**
 * Solo texto libre. El resto ya es bilingüe o no tiene sentido traducirlo:
 * las opciones se resuelven por `option.label`, y fechas, números, países y
 * archivos no son prosa.
 */
const FREE_TEXT_TYPES = new Set(["short_text", "long_text"]);

/** Traducir un dato tan corto no aporta y suele ser un código o un nombre. */
const MIN_CHARS = 2;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export interface TranslatedAnswers {
  /** field_key -> texto traducido. */
  byKey: Record<string, string>;
  fromCache: number;
  translated: number;
}

const EMPTY: TranslatedAnswers = { byKey: {}, fromCache: 0, translated: 0 };

/**
 * Traduce los valores de texto libre de una solicitud al locale pedido,
 * cacheando por (solicitud, campo, locale, hash del origen).
 *
 * El llamador es responsable de haber verificado el opt-in del cliente
 * (`api_keys.allow_ai_translation`) antes de llegar acá: esta función manda
 * datos del solicitante al proveedor.
 */
export async function translateAnswers(
  requestId: string,
  definition: FormDefinition | null,
  data: Record<string, unknown>,
  targetLocale: string,
  opts: { actor: string },
): Promise<TranslatedAnswers> {
  if (!definition) return EMPTY;
  const src = definition.defaultLocale || "es";
  if (targetLocale === src) return EMPTY;

  // Candidatos: campos de texto libre con valor string no trivial.
  const candidates: { key: string; text: string; label: string }[] = [];
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (!FREE_TEXT_TYPES.has(field.type)) continue;
      const raw = data[field.key];
      if (typeof raw !== "string") continue;
      const text = raw.trim();
      if (text.length < MIN_CHARS) continue;
      candidates.push({
        key: field.key,
        text,
        label: resolveText(field.label, src) || field.key,
      });
    }
  }
  if (!candidates.length) return EMPTY;

  const supabase = createServiceClient();
  const { data: cached } = await supabase
    .from("answer_translations")
    .select("field_key, source_hash, text")
    .eq("request_id", requestId)
    .eq("target_locale", targetLocale);

  const cacheByKey = new Map(
    (cached ?? []).map((r) => [`${r.field_key}:${r.source_hash}`, r.text as string]),
  );

  const byKey: Record<string, string> = {};
  const misses: { key: string; text: string; label: string; hash: string }[] = [];

  for (const c of candidates) {
    const h = hash(`${targetLocale}:${c.text}`);
    const hit = cacheByKey.get(`${c.key}:${h}`);
    if (hit != null) byKey[c.key] = hit;
    else misses.push({ ...c, hash: h });
  }

  const fromCache = Object.keys(byKey).length;
  if (!misses.length) return { byKey, fromCache, translated: 0 };

  const provider = getTranslationProvider();
  const items: TranslateItem[] = misses.map((m) => ({
    id: m.key,
    text: m.text,
    hint: `respuesta que escribió el solicitante a «${m.label}»`,
  }));

  const { results, usage } = await translateAll(provider, items, {
    from: src,
    to: targetLocale,
  });

  const byMissKey = new Map(misses.map((m) => [m.key, m]));
  const rows: {
    request_id: string;
    field_key: string;
    target_locale: string;
    source_hash: string;
    text: string;
    model: string;
  }[] = [];

  for (const r of results) {
    const miss = byMissKey.get(r.id);
    if (!miss) continue;
    // `keepSource` (nombre propio, código): se guarda el origen para no
    // volver a preguntar por el mismo texto en cada consulta.
    const text = r.keepSource ? miss.text : r.text;
    if (!text.trim()) continue;
    byKey[miss.key] = text;
    rows.push({
      request_id: requestId,
      field_key: miss.key,
      target_locale: targetLocale,
      source_hash: miss.hash,
      text,
      model: provider.model,
    });
  }

  if (rows.length) {
    await supabase
      .from("answer_translations")
      .upsert(rows, { onConflict: "request_id,field_key,target_locale,source_hash" });
  }

  // Contabilidad de tokens/costo. Una corrida por llamada: acá no hay chunking
  // por secciones como en la traducción de formularios.
  await recordAiUsage({
    runId: randomUUID(),
    operation: "answer_translate",
    provider: provider.name,
    model: provider.model,
    fromLocale: src,
    toLocale: targetLocale,
    items: items.length,
    itemsReturned: results.length,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    actor: opts.actor,
    requestId,
  });

  // Queda registrado que datos del solicitante salieron hacia el proveedor.
  await logAudit({
    requestId,
    actor: opts.actor,
    action: "answer_translation",
    metadata: {
      locale: targetLocale,
      provider: provider.name,
      model: provider.model,
      fields: rows.map((r) => r.field_key),
      fromCache,
      translated: rows.length,
    },
  });

  return { byKey, fromCache, translated: rows.length };
}

/**
 * ¿La API key tiene habilitada la traducción de respuestas? Default `false`:
 * ningún cliente manda PII al proveedor sin activarlo en el panel.
 */
export async function clientAllowsTranslation(keyId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("api_keys")
    .select("allow_ai_translation")
    .eq("id", keyId)
    .maybeSingle();
  return data?.allow_ai_translation === true;
}

/** Locales disponibles para traducir una definición (distintos del de origen). */
export function translatableLocales(definition: FormDefinition | null): string[] {
  if (!definition) return [];
  const src = definition.defaultLocale || "es";
  return definition.locales.filter((l) => l !== src);
}

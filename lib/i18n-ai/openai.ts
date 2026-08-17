import "server-only";
import { env } from "@/lib/env";
import { systemPrompt } from "./glossary";
import type {
  TranslateBatchResult,
  TranslateItem,
  TranslateOptions,
  TranslateResult,
  TranslationProvider,
} from "./provider";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 60_000;

// Structured Outputs en modo `strict` exige que TODAS las propiedades estén en
// `required` y `additionalProperties: false` en cada nivel. Con esto la
// respuesta es JSON válido conforme al schema, sin parseo defensivo ni reintentos
// por formato.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          keepSource: { type: "boolean" },
        },
        required: ["id", "text", "keepSource"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string };
}

/**
 * Proveedor OpenAI vía `fetch` — sin dependencia npm nueva, igual que la
 * integración de DIDIT (ver lib/didit/verify.ts).
 */
export class OpenAiTranslationProvider implements TranslationProvider {
  readonly name = "openai";
  readonly model: string;

  constructor(model = env.translateModel()) {
    this.model = model;
  }

  async translateBatch(
    items: TranslateItem[],
    opts: TranslateOptions,
  ): Promise<TranslateBatchResult> {
    if (items.length === 0) return { results: [] };

    const apiKey = env.openaiApiKey();
    if (!apiKey) throw new Error("Falta OPENAI_API_KEY");

    const payload = items.map((it) => ({
      id: it.id,
      text: it.text,
      ...(it.hint ? { hint: it.hint } : {}),
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt(opts.from, opts.to) },
        { role: "user", content: JSON.stringify({ items: payload }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "translations", strict: true, schema: RESPONSE_SCHEMA },
      },
      // Consistencia: el mismo texto debe traducirse igual siempre.
      temperature: 0,
    };

    const data = await this.call(apiKey, body);

    const refusal = data.choices?.[0]?.message?.refusal;
    if (refusal) throw new Error(`OpenAI rechazó la traducción: ${refusal}`);

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI devolvió una respuesta vacía");

    let parsed: { items?: unknown };
    try {
      parsed = JSON.parse(content) as { items?: unknown };
    } catch {
      throw new Error("OpenAI devolvió JSON inválido");
    }

    const results: TranslateResult[] = [];
    if (Array.isArray(parsed.items)) {
      for (const raw of parsed.items) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.id !== "string" || typeof r.text !== "string") continue;
        results.push({ id: r.id, text: r.text, keepSource: r.keepSource === true });
      }
    }

    return {
      results,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * POST con reintento acotado. Dos casos que valen un reintento:
   * `temperature` no soportado (algunos modelos solo aceptan el default) y
   * fallos transitorios (429 / 5xx).
   */
  private async call(
    apiKey: string,
    body: Record<string, unknown>,
    attempt = 0,
  ): Promise<ChatResponse> {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) return (await res.json()) as ChatResponse;

    const text = await res.text().catch(() => "");

    // Modelos que no admiten `temperature`: se reintenta sin el parámetro.
    if (res.status === 400 && /temperature/i.test(text) && "temperature" in body) {
      const rest = { ...body };
      delete rest.temperature;
      return this.call(apiKey, rest, attempt);
    }

    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1_500));
      return this.call(apiKey, body, 1);
    }

    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
}

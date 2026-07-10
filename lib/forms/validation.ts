import { z } from "zod";
import type { Field } from "./definition";

const MSG: Record<string, { required: string; email: string }> = {
  es: { required: "Requerido", email: "Email inválido" },
  en: { required: "Required", email: "Invalid email" },
};

function msg(locale: string) {
  return MSG[locale] ?? MSG.es;
}

/** Construye el Zod de un campo según su tipo, requerido y validaciones. */
export function fieldZod(field: Field, locale = "es"): z.ZodTypeAny {
  const m = msg(locale);
  const v = field.validation ?? {};
  const req = field.required;

  switch (field.type) {
    case "email": {
      let s = z.string().email(m.email);
      if (!req) return s.optional().or(z.literal(""));
      return s.min(1, m.required);
    }
    case "short_text":
    case "long_text": {
      let s = z.string();
      if (v.minLen != null) s = s.min(v.minLen);
      if (v.maxLen != null) s = s.max(v.maxLen);
      if (v.pattern) s = s.regex(new RegExp(v.pattern));
      if (!req) return s.optional().or(z.literal(""));
      return s.min(1, m.required);
    }
    case "number": {
      let n = z.coerce.number();
      if (v.min != null) n = n.min(v.min);
      if (v.max != null) n = n.max(v.max);
      return req ? n : n.optional();
    }
    case "date": {
      const s = z.string();
      return req ? s.min(1, m.required) : s.optional().or(z.literal(""));
    }
    case "single_choice":
    case "dropdown": {
      const s = z.string();
      return req ? s.min(1, m.required) : s.optional().or(z.literal(""));
    }
    case "multiple_choice": {
      const a = z.array(z.string());
      return req ? a.min(1, m.required) : a.optional();
    }
    case "file": {
      // Las respuestas de archivo son arrays de referencias { path, filename }.
      const a = z.array(z.any());
      return req ? a.min(1, m.required) : a.optional();
    }
    case "boolean": {
      const b = z.boolean();
      return req ? b.refine((x) => x === true, { message: m.required }) : b.optional();
    }
    default:
      return z.any().optional();
  }
}

/** Objeto Zod para un conjunto de campos (clave = field.key). */
export function buildZod(
  fields: Field[],
  locale = "es",
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (f.type === "note") continue; // display-only, sin respuesta
    shape[f.key] = fieldZod(f, locale);
  }
  return z.object(shape);
}

import { resolveText, type Field } from "./definition";

/** Formatea el valor de una respuesta de forma legible según el tipo del campo. */
export function renderAnswer(
  field: Field,
  value: unknown,
  locale: string,
): string {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return "—";
  }

  switch (field.type) {
    case "single_choice":
    case "dropdown": {
      const opt = field.options?.find((o) => o.value === String(value));
      return opt ? resolveText(opt.label, locale) : String(value);
    }
    case "multiple_choice": {
      const arr = Array.isArray(value) ? value : [value];
      return (
        arr
          .map((v) => {
            const opt = field.options?.find((o) => o.value === String(v));
            return opt ? resolveText(opt.label, locale) : String(v);
          })
          .join(", ") || "—"
      );
    }
    case "file": {
      const arr = Array.isArray(value) ? value : [];
      return (
        arr
          .map((r) =>
            r && typeof r === "object" && "filename" in r
              ? String((r as { filename: unknown }).filename)
              : String(r),
          )
          .join(", ") || "—"
      );
    }
    case "boolean":
      return value === true ? "Sí" : "No";
    default:
      return String(value);
  }
}

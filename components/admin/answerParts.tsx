import type { ReactNode } from "react";
import { DocPreview } from "@/components/admin/DocPreview";
import { fileRefsOf, renderAnswer } from "@/lib/forms/answers";
import type { Field } from "@/lib/forms/definition";

/**
 * El par pregunta/respuesta del panel y del informe.
 *
 * La pregunta es metadato (pequeña, semibold, apagada) y la respuesta es
 * contenido (mayor, tinta plena, interlineado respirado). Antes ambas iban en
 * peso 400 y solo las separaba el color, así que se leían como un mismo párrafo
 * — y en papel peor todavía, porque `--muted` se OSCURECE al imprimir y las
 * acerca más. Apoyar la distinción en el peso y no en el color la hace
 * sobrevivir a los tres temas.
 *
 * Va DENTRO de un `<dl>`: aporta su propio `<div>` con el `<dt>`/`<dd>`, que es
 * agrupación válida en HTML y lo que ya usaban los sitios que sustituye.
 */

type Size = "md" | "sm";

const LABEL: Record<Size, string> = {
  // Preguntas del formulario: frases largas, nunca en mayúsculas.
  md: "text-xs font-semibold leading-snug text-muted",
  // Campos curados de un check: etiquetas cortas, aguantan la versalita. En las
  // columnas estrechas del bloque de verificación alguna parte en dos líneas
  // («DOCUMENT NUMBER»); es aceptable y preferible a bajar de 12px, que en papel
  // ya estaba al límite.
  sm: "text-xs font-semibold uppercase tracking-wide text-muted",
};

const VALUE: Record<Size, string> = {
  md: "mt-1 break-words text-sm leading-relaxed text-foreground",
  sm: "mt-0.5 break-words text-[13px] text-foreground",
};

/** Texto libre largo: conserva los saltos de línea y limita la medida. */
const LONG = "max-w-[68ch] whitespace-pre-line";

export function AnswerField({
  label,
  size = "md",
  long = false,
  className = "",
  children,
  footer,
}: {
  label: string;
  size?: Size;
  /** Texto libre largo (ver `isLongAnswer`). */
  long?: boolean;
  className?: string;
  children: ReactNode;
  /** Va dentro del `<dd>`, tras el valor: verificación, traducción… */
  footer?: ReactNode;
}) {
  return (
    // `sm:col-span-2` es inerte fuera de una rejilla, así que la misma prop vale
    // tanto en el informe (apilado) como en el detalle (dos columnas).
    <div className={long ? `sm:col-span-2 ${className}` : className}>
      <dt className={LABEL[size]}>{label}</dt>
      <dd className={VALUE[size]}>
        {/* El `whitespace-pre-line` va en este envoltorio y no en el `<dd>`: así
            no lo heredan ni el footer (bloque de verificación) ni las
            miniaturas. */}
        <div className={long ? LONG : undefined}>{children}</div>
        {footer}
      </dd>
    </div>
  );
}

/** Renderiza la respuesta de un campo: miniaturas para file/selfie, texto para el resto. */
export function AnswerValue({
  field,
  value,
  locale,
  signedUrls,
}: {
  field: Field;
  value: unknown;
  locale: string;
  signedUrls: Record<string, string>;
}) {
  if (field.type === "file" || field.type === "selfie") {
    const refs = fileRefsOf(value);
    if (refs.length === 0) return <>—</>;
    return (
      <div className="mt-1 flex flex-wrap gap-2">
        {refs.map((r, i) => (
          <DocPreview key={i} path={r.path} filename={r.filename} url={signedUrls[r.path]} />
        ))}
      </div>
    );
  }
  return <>{renderAnswer(field, value, locale)}</>;
}

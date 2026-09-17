/**
 * Encabezado de sección del informe: una banda con superficie propia, barrita de
 * acento y el nombre del sujeto a la derecha.
 *
 * Antes era una píldora con borde y sin fondo, que flotaba sin anclar nada. Y es
 * un encabezado REAL (`<h2>`/`<h3>`), no un `<span>`: así hereda el
 * `break-after: avoid` del `@media print` y nunca queda huérfano al pie.
 */
export function ReportSectionHeader({
  title,
  subject,
  action,
  as: Tag = "h2",
}: {
  title: string;
  /** Nombre del sujeto del informe; identifica la hoja cuando la sección abre página. */
  subject?: string;
  /** Control opcional (p. ej. el selector de traducción), oculto al imprimir. */
  action?: React.ReactNode;
  /** `h3` para las secciones del formulario, anidadas dentro de «Respuestas». */
  as?: "h2" | "h3";
}) {
  return (
    // `surface-card` y no `surface-2`: en claro este último (#f1f5f9) es casi
    // idéntico al fondo de página (#f2f5f9) y la banda no se lee como banda.
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-card px-4 py-2.5">
      {/* Único uso deliberado del teal de marca en el admin. Como acento
          estructural funciona; como texto o estado no llegaría al contraste
          mínimo, así que no se usa para nada que signifique algo. */}
      <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-accent" />
      {/* Sin `tracking-*`: `.font-display` ya fija el interletraje y, al estar
          fuera de `@layer`, gana a cualquier utilidad. */}
      <Tag
        className={`font-display font-bold text-foreground ${
          Tag === "h2" ? "text-base" : "text-sm"
        }`}
      >
        {title}
      </Tag>
      {subject && <span className="ml-auto truncate text-xs text-muted">{subject}</span>}
      {action}
    </div>
  );
}

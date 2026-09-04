/**
 * Encabezado de sección del informe, al estilo de DIDIT: una píldora con el
 * nombre de la sección a la izquierda y, en gris a la derecha, a qué documento
 * pertenece la hoja.
 *
 * Como cada sección abre página (`.print-page`), esto hace de cabecera de página
 * sin necesitar el encabezado corrido de Chrome, que no puede variar por sección.
 */
export function ReportSectionHeader({
  title,
  subject,
  action,
}: {
  title: string;
  /** Nombre del sujeto del informe; identifica la hoja si se separa del resto. */
  subject: string;
  /** Control opcional (p. ej. el selector de traducción), oculto al imprimir. */
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground">
        {title}
      </span>
      <span className="ml-auto truncate text-sm text-muted">{subject}</span>
      {action}
    </div>
  );
}

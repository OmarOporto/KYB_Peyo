import { DocLink } from "./DocLink";
import { isImagePath } from "./docParts";

// La clasificación de archivos vive en `docParts` para que la sección
// «Documentos» y esta miniatura compartan el mismo criterio.
export { isImagePath };

/**
 * Muestra un documento del bucket privado: miniatura clickeable (abre en grande
 * en pestaña nueva) si es imagen y hay URL firmada; si no, un link de descarga.
 */
export function DocPreview({
  path,
  filename,
  url,
  mime,
}: {
  path: string;
  filename: string;
  url?: string;
  mime?: string | null;
}) {
  if (url && isImagePath(filename, mime)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className="block w-fit"
        title={filename}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename}
          className="max-h-40 rounded-lg border border-border object-contain transition-opacity hover:opacity-90"
        />
      </a>
    );
  }
  return <DocLink path={path} filename={filename} />;
}

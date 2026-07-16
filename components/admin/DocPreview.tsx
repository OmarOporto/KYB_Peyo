import { DocLink } from "./DocLink";

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|heic|heif|bmp|avif)$/i;

/** True si el archivo parece una imagen (por mime o por extensión del nombre). */
export function isImagePath(filename: string, mime?: string | null): boolean {
  if (mime && mime.startsWith("image/")) return true;
  return IMAGE_EXT_RE.test(filename);
}

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

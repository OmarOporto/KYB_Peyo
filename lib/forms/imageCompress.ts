/**
 * Compresión/redimensionado de imágenes en el cliente antes de subirlas.
 *
 * Reduce el peso que viaja a Storage y, luego, lo que se descarga y se envía a
 * DIDIT. Es conservador para no romper la legibilidad de documentos (OCR /
 * face-match): solo reescala si la imagen supera `maxDim` y usa JPEG de calidad
 * alta. Ante cualquier problema (no es imagen, el navegador no soporta las APIs,
 * o el resultado saldría más grande) devuelve el archivo original sin tocarlo.
 */

export interface DownscaleOptions {
  /** Lado mayor máximo en px. Imágenes menores no se reescalan. */
  maxDim?: number;
  /** Calidad JPEG (0-1). */
  quality?: number;
}

const DEFAULTS: Required<DownscaleOptions> = { maxDim: 2000, quality: 0.85 };

/** ¿Es un tipo de imagen que conviene (y podemos) recomprimir a JPEG? */
function isCompressibleImage(file: File): boolean {
  // PDFs, SVG y otros no-rasterizables se dejan intactos.
  return /^image\/(jpe?g|png|webp)$/i.test(file.type);
}

export async function downscaleImage(
  file: File,
  options: DownscaleOptions = {},
): Promise<File> {
  const { maxDim, quality } = { ...DEFAULTS, ...options };

  if (
    typeof window === "undefined" ||
    typeof createImageBitmap !== "function" ||
    !isCompressibleImage(file)
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const largest = Math.max(width, height);
    const scale = largest > maxDim ? maxDim / largest : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) {
      // Si no hubo blob, o recomprimir no mejora el tamaño, conservar el original.
      return file;
    }

    const newName = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, "") + ".jpg";
    return new File([blob], newName, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    // Cualquier fallo de decodificación/encoding → subir el archivo original.
    return file;
  }
}

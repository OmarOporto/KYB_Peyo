/**
 * Construcción y validación de claves de Storage para los documentos de una
 * solicitud.
 *
 * El path es `<requestId>/<docType>/<uuid>-<filename>`, y ese primer segmento
 * es lo único que aísla los documentos de una solicitud de los de otra. El
 * `filename` ya venía saneado, pero el `docType` entraba crudo desde el Server
 * Action —que es un endpoint POST invocable a mano— y la comprobación de
 * pertenencia era un `startsWith`, que `<mi-id>/../<otro-id>/x` satisface.
 *
 * Sin `import "server-only"` ni alias `@/` a propósito: así se puede probar con
 * `node --test --experimental-strip-types` sin arrastrar el runtime de Next.
 */

/**
 * Segmento intermedio del path (hoy, el `docType`). Sin `/` y sin `.`, así que
 * no puede formar `..` ni salirse de la carpeta de la solicitud.
 *
 * El punto queda fuera de la clase permitida a propósito: un segmento de
 * carpeta no necesita extensión, y permitirlo es lo que habilita el traversal.
 */
export function safeSegment(value: string, fallback = "general"): string {
  const clean = (value ?? "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
  return clean || fallback;
}

/**
 * Nombre de archivo. Acá el punto SÍ se conserva: sin extensión, el visor del
 * panel y la descarga pierden el tipo. Es seguro porque el nombre siempre va
 * como último segmento y precedido de un uuid, así que nunca puede quedar
 * convertido en `..` por sí solo.
 */
export function safeFilename(value: string, fallback = "archivo"): string {
  const clean = (value ?? "").replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "");
  return clean || fallback;
}

/**
 * ¿Esta clave pertenece a esta solicitud?
 *
 * Reemplaza al `startsWith(\`${requestId}/\`)` anterior: compara el primer
 * segmento completo y rechaza cualquier segmento vacío, `.` o `..`, que es
 * justo lo que el prefijo dejaba pasar.
 */
export function isOwnedPath(path: string, requestId: string): boolean {
  if (!path || !requestId) return false;
  const segments = path.split("/");
  if (segments.length < 2) return false;
  if (segments[0] !== requestId) return false;
  return segments.every((s) => s !== "" && s !== "." && s !== "..");
}

/** `<requestId>/<docType saneado>/<uuid>-<filename saneado>`. */
export function documentPath(
  requestId: string,
  docType: string,
  filename: string,
  uuid: string,
): string {
  return `${requestId}/${safeSegment(docType)}/${uuid}-${safeFilename(filename)}`;
}

/**
 * ¿El archivo encaja en el `accept` del campo? Acepta las dos formas que
 * permite el atributo HTML: tipo MIME (`application/pdf`, `image/*`) y
 * extensión (`.pdf`). Una lista vacía significa "sin restricción", que es el
 * default de `fileConfigSchema`.
 */
export function mimeAllowed(
  accept: readonly string[] | undefined,
  mime: string | null | undefined,
  filename: string,
): boolean {
  if (!accept || accept.length === 0) return true;
  const type = (mime ?? "").toLowerCase();
  const name = (filename ?? "").toLowerCase();

  return accept.some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

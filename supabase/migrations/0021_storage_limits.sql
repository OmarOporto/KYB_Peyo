-- =============================================================
-- Storage: techo duro de tamaño (y tipo, donde aplica) por bucket.
--
-- Las subidas del solicitante van por signed upload URL: del navegador DIRECTO
-- a Storage, sin pasar por nuestro código. `maxSizeMB` y `accept` de la
-- definición del formulario se evaluaban solo en el navegador, así que quien
-- llamara al Server Action a mano podía subir lo que quisiera y del tamaño que
-- quisiera. El bucket es el único punto que ve esa subida.
--
-- Esto es el techo, no el límite fino: el límite por campo se sigue aplicando
-- al confirmar la subida (app/f/[token]/actions.ts), donde ya se conoce contra
-- qué campo del formulario se está subiendo.
-- =============================================================

-- 15 MB = el mismo límite que ya aplicaba la ruta legacy uploadDocumentAction.
-- Sin allowed_mime_types: cada formulario declara su propio `accept` por campo
-- y una lista global acá rompería cualquier formulario que pida un tipo nuevo.
update storage.buckets
set file_size_limit = 15 * 1024 * 1024
where id = 'kyb-documents';

-- form-assets es PÚBLICO (se sirve sin firmar) y solo recibe imágenes de ayuda
-- subidas por un analista. Acá sí conviene la lista cerrada: image/svg+xml
-- queda FUERA a propósito, porque un SVG puede llevar script y se serviría
-- desde el dominio de Storage. El código ya limitaba a `image/*`, que incluía
-- SVG.
--
-- Ojo con el alcance: Storage compara el Content-Type declarado en la subida,
-- no los magic bytes del archivo. Esto cierra el SVG y acota el tamaño; no
-- sustituye a un sniffing real del contenido.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array[
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/avif'
    ]
where id = 'form-assets';

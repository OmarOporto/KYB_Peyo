-- =============================================================
-- Revisión del formulario estampada en la solicitud
-- -------------------------------------------------------------
-- La app cliente fija su mapeo de campos por versión de formulario, pero hasta
-- ahora no había ninguna versión real que exponer: las tres candidatas eran
-- constantes.
--
--   formDefinitionSchema.version  z.literal(1)  -> versión del FORMATO, siempre 1
--   forms.version                 int           -> nunca se incrementaba
--   kyb_requests.form_version     text          -> legado de 0001_init, siempre 'v1'
--
-- `forms.version` pasa a incrementarse al publicar cuando cambia el set de
-- claves (ver app/admin/(dash)/forms/actions.ts) y se estampa acá al crear la
-- solicitud, junto al snapshot de `form_definition`.
--
-- Se llama `form_revision` y no `form_version` para no agravar la colisión de
-- nombres: la columna `form_version` queda DEPRECADA en su sitio.
-- =============================================================

-- Nullable a propósito: las solicitudes anteriores a esta migración no tienen
-- revisión conocida, y `null` es información honesta. Un default inventado
-- haría que el cliente fije un mapeo contra una revisión que nunca existió.
alter table public.kyb_requests
  add column if not exists form_revision integer;

comment on column public.kyb_requests.form_revision is
  'forms.version vigente al crear la solicitud. Null en solicitudes previas a 0018.';

comment on column public.kyb_requests.form_version is
  'DEPRECADO (legado de 0001_init, siempre ''v1''). Usar form_revision.';

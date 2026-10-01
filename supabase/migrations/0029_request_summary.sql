-- =============================================================
-- Título y email de contacto de la solicitud
-- -------------------------------------------------------------
-- En el builder se puede marcar una pregunta de texto corto como "título" y una
-- de tipo email como "email de contacto" (`definition.internalFields`, ver
-- lib/forms/internalFields.ts). Sus respuestas se guardan acá, desnormalizadas,
-- para que la lista del panel muestre y busque por nombre sin leer el jsonb de
-- cada solicitud, y para exponerlas por API y webhook.
--
-- Las escribe la app (lib/kyb/service.ts): el autoguardado solo rellena, el
-- envío es la fuente de verdad, y al cambiar la marca de un formulario se
-- recalculan todas sus solicitudes (eso hace también de backfill).
-- =============================================================

-- Nullables: sin pregunta marcada, o sin respuesta, no hay valor que poner.
alter table public.kyb_requests
  add column if not exists subject_title text,
  add column if not exists contact_email text;

comment on column public.kyb_requests.subject_title is
  'Respuesta a la pregunta marcada como título en el formulario (internalFields.title).';

comment on column public.kyb_requests.contact_email is
  'Respuesta a la pregunta marcada como email de contacto (internalFields.contactEmail).';

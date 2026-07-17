-- Snapshot de la definición del formulario al momento de crear la solicitud.
-- Evita que editar/re-publicar un formulario mientras un solicitante lo llena
-- cambie las reglas de validación al enviar (mismatch cliente/servidor).
-- Nullable: solicitudes viejas o creadas por API sin formulario caen al fallback.
alter table public.kyb_requests
  add column if not exists form_definition jsonb;

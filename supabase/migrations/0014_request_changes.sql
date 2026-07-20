-- Ciclo de "solicitar correcciones" por-pregunta + motivo de la decisión.
--
-- 1. Nuevo estado NO-terminal `changes_requested`: el analista o el cliente (API)
--    devuelven una solicitud ya enviada para que el solicitante corrija preguntas
--    puntuales (su respuesta se borra y queda disponible de nuevo).
-- 2. `corrections`: set ABIERTO de la ronda vigente (qué preguntas + nota por
--    pregunta). Se limpia (null) al reenviar; el historial por ronda vive en audit_log.
-- 3. `decision_reason`: motivo legible de la decisión final (rechazo/aprobación),
--    expuesto en el webhook `decision.made` y en GET /requests/:id.

-- El CHECK inline de 0001 se auto-nombra <tabla>_<columna>_check por convención Postgres.
alter table public.kyb_requests
  drop constraint if exists kyb_requests_status_check;
alter table public.kyb_requests
  add constraint kyb_requests_status_check
  check (status in (
    'created','in_progress','submitted','under_review',
    'changes_requested','approved','rejected','expired'
  ));

alter table public.kyb_requests
  add column if not exists corrections     jsonb;
alter table public.kyb_requests
  add column if not exists decision_reason text;

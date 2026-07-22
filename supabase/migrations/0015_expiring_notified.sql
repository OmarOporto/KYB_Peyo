-- Aviso proactivo "por vencer" (evento webhook request.expiring).
-- Marca cuándo se envió el aviso previo al vencimiento del link, para no repetirlo.
-- Se reinicia (a null) al re-emitir el link (issueToken), abriendo un nuevo ciclo.
alter table public.kyb_requests
  add column if not exists expiring_notified_at timestamptz;

-- Acelera el barrido "por vencer": solo mira filas aún no avisadas.
create index if not exists kyb_requests_expiring_idx
  on public.kyb_requests (token_expires_at)
  where expiring_notified_at is null;

-- =============================================================
-- Anti-replay de webhooks entrantes.
--
-- El webhook firmado de DIDIT valida el HMAC del cuerpo, pero nada impedía
-- reenviar una entrega capturada: volvía a escribir aml_checks, así que un
-- resultado viejo podía pisar uno más nuevo.
--
-- Se deduplica por hash del cuerpo CRUDO, y no por un id del payload, porque
-- el esquema de DIDIT sigue sin confirmarse (ver TODO(DIDIT) en la ruta). No
-- hace falta más: como la firma cubre el cuerpo, un atacante no puede alterarlo
-- sin invalidarla, así que todo replay de una entrega capturada es byte a byte
-- idéntico al original.
-- =============================================================
create table if not exists public.webhook_replay_guard (
  provider  text        not null,
  body_hash text        not null,
  seen_at   timestamptz not null default now(),
  primary key (provider, body_hash)
);

-- Para la limpieza por antigüedad.
create index if not exists webhook_replay_guard_seen_at_idx
  on public.webhook_replay_guard (seen_at);

-- Como api_keys: sin políticas -> solo accesible por service-role.
alter table public.webhook_replay_guard enable row level security;

grant all on public.webhook_replay_guard to service_role;

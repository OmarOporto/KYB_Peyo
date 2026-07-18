-- Idempotencia para POST /api/v1/kyb/requests: evita crear solicitudes
-- duplicadas (y disparar verificaciones DIDIT pagadas dos veces) cuando el
-- cliente reintenta por timeout o pérdida de conexión.
create table if not exists public.idempotency_keys (
  api_key_id      uuid    not null references public.api_keys(id) on delete cascade,
  key             text    not null,
  request_hash    text    not null,
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  primary key (api_key_id, key)
);

alter table public.idempotency_keys enable row level security;

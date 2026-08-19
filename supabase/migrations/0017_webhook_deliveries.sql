-- =============================================================
-- Cola durable de entregas de webhook
-- -------------------------------------------------------------
-- Antes la entrega ocurría inline en la invocación del que llama: 3 intentos
-- con backoff de 500 ms (~1,5 s de ventana total). Un receptor caído 10
-- segundos perdía el evento para siempre. Ahora `notifyClient` ENCOLA y un cron
-- drena la cola con reintentos escalonados hasta 24 h.
--
-- El payload se congela al encolar y NO se re-lee al reintentar: un
-- `decision.made` reintentado seis horas después debe describir la decisión
-- como fue, no el estado actual. Eso es lo que hace que el dedupe por
-- `event_id` del receptor tenga sentido.
-- =============================================================

create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid references public.kyb_requests(id) on delete cascade,
  endpoint_id     uuid not null references public.webhook_endpoints(id) on delete cascade,
  event           text not null,
  -- Estable entre intentos: es la clave con la que el receptor deduplica.
  event_id        text not null unique,
  -- Body congelado. La FIRMA no se guarda: se recalcula en cada intento con un
  -- timestamp fresco, porque el receptor rechaza timestamps > 5 min
  -- (anti-replay). Ver lib/kyb/webhook.ts.
  payload         jsonb not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'delivered', 'failed')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  last_status     integer,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Índice parcial: el barrido del cron solo mira pendientes vencidas.
create index if not exists webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at)
  where status = 'pending';

create index if not exists webhook_deliveries_request_idx
  on public.webhook_deliveries (request_id);

create index if not exists webhook_deliveries_endpoint_idx
  on public.webhook_deliveries (endpoint_id, created_at desc);

alter table public.webhook_deliveries enable row level security;

-- Lectura para analistas (panel de reenvío); escrituras por service-role.
create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated using (public.is_analyst());

grant all on public.webhook_deliveries to service_role;
grant select on public.webhook_deliveries to authenticated;

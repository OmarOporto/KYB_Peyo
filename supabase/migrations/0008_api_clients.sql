-- API como servicio multi-cliente:
--  * límite de tasa configurable por API key + tracking de uso
--  * aislamiento por cliente (cada solicitud pertenece a la key que la creó)
--  * callback_url para el webhook saliente
-- Todo additive / backward-compatible.

-- 1. api_keys: límite por key, tracking de uso, traza de rotación.
alter table public.api_keys
  add column if not exists rate_limit_per_min integer,
  add column if not exists last_used_at        timestamptz,
  add column if not exists rotated_from        uuid references public.api_keys(id);

-- 2. kyb_requests: dueño (API key) + callback del webhook.
alter table public.kyb_requests
  add column if not exists api_key_id   uuid references public.api_keys(id),
  add column if not exists callback_url text;

create index if not exists kyb_requests_api_key_idx
  on public.kyb_requests (api_key_id);

-- 3. Uso diario por key (alimenta el panel de Clientes API).
create table if not exists public.api_key_usage (
  api_key_id uuid    not null references public.api_keys(id) on delete cascade,
  day        date    not null default current_date,
  count      integer not null default 0,
  primary key (api_key_id, day)
);

-- 4. Contadores de ventana (por minuto) para el rate limit.
create table if not exists public.api_rate_counters (
  api_key_id   uuid        not null references public.api_keys(id) on delete cascade,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (api_key_id, window_start)
);

-- RLS: como api_keys, sin políticas -> solo accesibles por service-role.
alter table public.api_key_usage     enable row level security;
alter table public.api_rate_counters enable row level security;

-- 5. Consumo atómico de una llamada: cuenta en la ventana del minuto, actualiza
-- last_used_at, incrementa el uso del día y decide si se permite (límite por key
-- o el default global). Devuelve una fila { allowed, limit_per_min, remaining }.
create or replace function public.consume_api_key(p_key_id uuid, p_default integer)
returns table (allowed boolean, limit_per_min integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit  integer;
  v_window timestamptz := date_trunc('minute', now());
  v_count  integer;
begin
  select coalesce(rate_limit_per_min, p_default) into v_limit
  from public.api_keys where id = p_key_id;
  v_limit := coalesce(v_limit, p_default);

  -- Limpieza oportunista de ventanas viejas de esta key.
  delete from public.api_rate_counters
  where api_key_id = p_key_id and window_start < now() - interval '10 minutes';

  insert into public.api_rate_counters (api_key_id, window_start, count)
  values (p_key_id, v_window, 1)
  on conflict (api_key_id, window_start)
  do update set count = public.api_rate_counters.count + 1
  returning count into v_count;

  update public.api_keys set last_used_at = now() where id = p_key_id;

  insert into public.api_key_usage (api_key_id, day, count)
  values (p_key_id, current_date, 1)
  on conflict (api_key_id, day)
  do update set count = public.api_key_usage.count + 1;

  allowed       := v_count <= v_limit;
  limit_per_min := v_limit;
  remaining     := greatest(v_limit - v_count, 0);
  return next;
end;
$$;

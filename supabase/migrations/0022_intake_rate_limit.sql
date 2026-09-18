-- =============================================================
-- Contador de rate limit genérico (por clave de texto).
--
-- `startPublicIntake` es un Server Action sin autenticación: cualquiera que
-- conozca el id de un formulario publicado podía crear filas en kyb_requests
-- sin límite. El contador por API key (api_rate_counters) no sirve acá, porque
-- su clave es un uuid con FK a api_keys y el intake público no tiene key.
--
-- Misma mecánica que consume_api_key: ventana de un minuto, incremento atómico
-- y limpieza oportunista de ventanas viejas.
-- =============================================================
create table if not exists public.rate_counters (
  bucket       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (bucket, window_start)
);

-- Como api_rate_counters: sin políticas -> solo accesible por service-role.
alter table public.rate_counters enable row level security;

create or replace function public.consume_rate(p_bucket text, p_limit integer)
returns table (allowed boolean, limit_per_min integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count  integer;
begin
  delete from public.rate_counters
  where bucket = p_bucket and window_start < now() - interval '10 minutes';

  insert into public.rate_counters (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start)
  do update set count = public.rate_counters.count + 1
  returning count into v_count;

  allowed       := v_count <= p_limit;
  limit_per_min := p_limit;
  remaining     := greatest(p_limit - v_count, 0);
  return next;
end;
$$;

-- Postgres otorga EXECUTE a PUBLIC por defecto en cada función nueva. En una
-- SECURITY DEFINER eso significa que cualquier rol (incluido anon vía PostgREST)
-- podría llamarla e inflar contadores ajenos, así que se revoca de entrada.
revoke execute on function public.consume_rate(text, integer) from public;
grant  execute on function public.consume_rate(text, integer) to service_role;

grant all on public.rate_counters to service_role;

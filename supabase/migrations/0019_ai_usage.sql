-- =============================================================
-- Registro de uso de IA (tokens y costo)
-- -------------------------------------------------------------
-- Cada respuesta del proveedor ya trae los tokens consumidos, pero hasta ahora
-- se descartaban: no había forma de saber cuánto costaba traducir. Estas tablas
-- persisten ese dato SIN llamadas extra al proveedor — el `usage` viene dentro
-- de la respuesta que ya se pagó.
-- =============================================================

-- Tarifa vigente por modelo. Se siembra con los defaults del código
-- (lib/i18n-ai/pricing.ts) y se edita desde el panel (solo rol admin).
create table if not exists public.ai_model_prices (
  model         text primary key,
  input_per_1m  numeric(12,4) not null,
  output_per_1m numeric(12,4) not null,
  currency      text not null default 'USD',
  updated_at    timestamptz not null default now(),
  updated_by    text
);

create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  -- Agrupa las N llamadas de una misma corrida (traducir un formulario son
  -- tantas llamadas como secciones, pero es UNA operación para el usuario).
  run_id         uuid not null,
  operation      text not null check (operation in ('form_translate', 'answer_translate')),
  provider       text not null,          -- openai | mock
  model          text not null,
  from_locale    text,
  to_locale      text,
  items          integer not null default 0,  -- textos enviados
  items_returned integer not null default 0,  -- textos que devolvió el modelo
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  -- Tarifa CONGELADA al momento del registro. Es lo que hace que editar un
  -- precio afecte solo a lo que venga después: sin esto, cambiar una tarifa
  -- recalcularía el historial entero y los totales de meses cerrados se
  -- moverían solos.
  input_per_1m   numeric(12,4),
  output_per_1m  numeric(12,4),
  cost           numeric(12,6),
  currency       text not null default 'USD',
  actor          text not null,
  form_id        uuid references public.forms(id) on delete set null,
  request_id     uuid references public.kyb_requests(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_run_idx on public.ai_usage (run_id);
create index if not exists ai_usage_request_idx on public.ai_usage (request_id);

alter table public.ai_model_prices enable row level security;
alter table public.ai_usage        enable row level security;

-- Lectura para analistas; escrituras por service-role (como el resto del admin).
create policy ai_model_prices_select on public.ai_model_prices
  for select to authenticated using (public.is_analyst());
create policy ai_usage_select on public.ai_usage
  for select to authenticated using (public.is_analyst());

grant all on public.ai_model_prices to service_role;
grant all on public.ai_usage        to service_role;
grant select on public.ai_model_prices to authenticated;
grant select on public.ai_usage        to authenticated;

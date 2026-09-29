-- =============================================================
-- Registro de cargos de DIDIT
-- -------------------------------------------------------------
-- La vista `didit_usage` (0025) solo contaba filas de aml_checks: no decía
-- cuánto se gastó y además perdía historial, porque pedir correcciones BORRA
-- los checks de las preguntas corregidas aunque DIDIT ya los haya cobrado.
--
-- Este registro no se borra (igual que ai_usage): cada fila es un cargo.
--   - kind = 'verification': sesión standalone de persona. El monto real sale de
--     GET /v3/session/{id}/decision/?include=events → cost_breakdown
--     (source 'didit'). Si DIDIT todavía no lo informa, amount queda NULL hasta
--     la próxima sincronización.
--   - kind = 'kyb_search' / 'kyb_select': las sesiones de empresa no traen
--     cost_breakdown, así que el monto es la tarifa pública (source 'tariff').
-- =============================================================

create table if not exists public.didit_charges (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  -- set null: el cargo sobrevive a la solicitud y al check (correcciones).
  request_id  uuid references public.kyb_requests(id) on delete set null,
  check_id    uuid references public.aml_checks(id) on delete set null,
  feature     text not null,
  kind        text not null check (kind in ('verification', 'kyb_search', 'kyb_select')),
  -- ID de sesión de DIDIT (request_id de la respuesta standalone). NULL en un
  -- select enviado sin confirmación (timeout/5xx: pudo facturarse).
  session_id  text,
  amount      numeric(12,4),
  currency    text not null default 'USD',
  source      text not null check (source in ('didit', 'tariff')),
  -- cost_breakdown crudo de DIDIT, o {unconfirmed: true} en un select dudoso.
  details     jsonb,
  created_at  timestamptz not null default now(),
  synced_at   timestamptz,
  -- Idempotencia: capturar al despachar y volver a sincronizar no duplica.
  -- (NULL no colisiona: cada select sin confirmar es su propio cargo.)
  constraint didit_charges_session_key unique (kind, session_id)
);

create index if not exists didit_charges_org_created_idx
  on public.didit_charges (org_id, created_at desc);
create index if not exists didit_charges_request_idx
  on public.didit_charges (request_id);
create index if not exists didit_charges_pending_idx
  on public.didit_charges (created_at) where amount is null;

alter table public.didit_charges enable row level security;

-- Mismo criterio que ai_usage (0025): el admin ve todo, un miembro su org.
-- Escrituras solo por service-role.
drop policy if exists didit_charges_select on public.didit_charges;
create policy didit_charges_select on public.didit_charges
  for select to authenticated
  using ((select public.is_platform_admin()) or org_id = any ((select public.auth_org_ids())::uuid[]));

grant all on public.didit_charges to service_role;
grant select on public.didit_charges to authenticated;

-- Reemplazada por didit_charges.
drop view if exists public.didit_usage;

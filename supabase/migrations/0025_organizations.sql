-- =============================================================
-- Organizaciones: cada dato del panel tiene dueño
-- -------------------------------------------------------------
-- Hasta acá el panel era de un solo equipo: cualquier fila en `analysts` veía y
-- tocaba todo. Ahora lo usan clientes, y cada uno integra con sus propias API
-- keys. La unidad de aislamiento es la ORGANIZACIÓN, no la persona: el día que
-- un cliente sume a un segundo usuario, comparte todo sin migrar datos.
--
-- Dueños directos (columna `org_id`): analysts, api_keys, forms, kyb_requests,
-- ai_usage. El resto hereda: las tablas hijas de una solicitud por
-- `request_id`, los webhooks por su API key.
--
-- `kyb_requests.org_id` se GUARDA en la fila en vez de derivarse: los intakes
-- web no tienen API key, y `form_id` se nulifica al borrar el formulario (0020),
-- así que no queda de dónde derivarlo. Las FKs compuestas de abajo impiden que
-- se desalinee de la key o del formulario.
--
-- DEFAULT temporal: `org_id` nace con default = Peyo para que el código que ya
-- está en producción (que no conoce la columna) siga insertando entre el
-- `db push` y el deploy. Una migración posterior quita el default, así un
-- insert que olvide la org falla en vez de caer en silencio en Peyo.
-- =============================================================

-- ------------------------------------------------------------
-- Organizaciones
-- ------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  -- Clave estable para el script de provisión (scripts/provision-users.mjs).
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name        text not null unique,
  created_at  timestamptz not null default now(),
  -- Deshabilitar en vez de borrar: las filas de la org quedan como evidencia.
  disabled_at timestamptz
);

-- UUID fijo: lo usan el default temporal, el seed y los tests.
insert into public.organizations (id, slug, name)
values ('00000000-0000-4000-8000-000000000001', 'peyo', 'Peyo')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- org_id en los dueños directos
-- ------------------------------------------------------------
-- Una columna NOT NULL con default constante se agrega sin reescribir la tabla
-- y deja todas las filas existentes en Peyo, que es de quien son hoy.
alter table public.analysts
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.organizations(id) on delete restrict,
  add column full_name   text,
  -- Baja lógica: un usuario que decidió solicitudes no se puede borrar
  -- (`kyb_requests.decided_by` lo referencia), así que se deshabilita.
  add column disabled_at timestamptz;

alter table public.api_keys
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.organizations(id) on delete restrict;

alter table public.forms
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.organizations(id) on delete restrict;

alter table public.kyb_requests
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.organizations(id) on delete restrict;

alter table public.ai_usage
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.organizations(id) on delete restrict;

-- ------------------------------------------------------------
-- Auditoría: de qué org y qué persona
-- ------------------------------------------------------------
-- Nullable: hay eventos sin org (sistema) y filas viejas sin persona.
alter table public.audit_log
  add column org_id        uuid references public.organizations(id) on delete restrict,
  add column actor_user_id uuid;

update public.audit_log l
set org_id = coalesce(
  (select r.org_id from public.kyb_requests r where r.id = l.request_id),
  '00000000-0000-4000-8000-000000000001'
);

-- Quien registra un evento de una solicitud no tiene que acordarse de la org:
-- sale de la solicitud.
create or replace function public.audit_log_fill_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.org_id is null and new.request_id is not null then
    select r.org_id into new.org_id
    from public.kyb_requests r
    where r.id = new.request_id;
  end if;
  return new;
end;
$$;

create trigger audit_log_fill_org
  before insert on public.audit_log
  for each row execute function public.audit_log_fill_org();

-- ------------------------------------------------------------
-- Consistencia de la org, forzada por la base
-- ------------------------------------------------------------
-- Una solicitud no puede apuntar a la key o al formulario de otra org, ni una
-- key tener como formulario por defecto uno ajeno. Se exige con FKs compuestas
-- (id, org_id) en vez de confiar en que cada ruta del código lo chequee.
alter table public.forms
  add constraint forms_id_org_key unique (id, org_id);
alter table public.api_keys
  add constraint api_keys_id_org_key unique (id, org_id);

-- Se reemplazan las FKs simples. Búsqueda por columna y no por nombre, por la
-- misma razón que en 0020: un `drop ... if exists` con el nombre equivocado no
-- falla y deja la FK vieja en pie.
do $$
declare
  c record;
begin
  for c in
    select con.conrelid::regclass::text as tbl, con.conname as cname
    from pg_constraint con
    where con.contype = 'f'
      and (
        (con.conrelid = 'public.kyb_requests'::regclass
          and con.confrelid in ('public.forms'::regclass, 'public.api_keys'::regclass))
        or (con.conrelid = 'public.api_keys'::regclass
          and con.confrelid = 'public.forms'::regclass)
      )
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.cname);
  end loop;
end $$;

-- `set null (form_id)`: al borrar el formulario solo se suelta el form_id; la
-- org de la solicitud se queda (Postgres 15+).
alter table public.kyb_requests
  add constraint kyb_requests_form_org_fkey
  foreign key (form_id, org_id) references public.forms(id, org_id)
  on delete set null (form_id);

alter table public.kyb_requests
  add constraint kyb_requests_api_key_org_fkey
  foreign key (api_key_id, org_id) references public.api_keys(id, org_id);

-- RESTRICT como en 0020: nulificar el KYB_FORM_ID de un cliente rompe su
-- integración sin aviso.
alter table public.api_keys
  add constraint api_keys_default_form_org_fkey
  foreign key (default_form_id, org_id) references public.forms(id, org_id)
  on delete restrict;

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
create index kyb_requests_org_created_idx on public.kyb_requests (org_id, created_at desc);
create index forms_org_updated_idx        on public.forms (org_id, updated_at desc);
create index api_keys_org_idx             on public.api_keys (org_id);
create index ai_usage_org_created_idx     on public.ai_usage (org_id, created_at desc);
create index analysts_org_idx             on public.analysts (org_id);
create index audit_log_org_idx            on public.audit_log (org_id, created_at desc);

-- ------------------------------------------------------------
-- Helpers de RLS
-- ------------------------------------------------------------
-- SECURITY DEFINER para leer `analysts` sin recursión de RLS (igual que
-- is_analyst). En las políticas se llaman como `(select fn())`: así Postgres
-- los evalúa UNA vez por consulta y no una vez por fila. El `::uuid[]` de
-- `= any ((select auth_org_ids())::uuid[])` no es decorativo: sin el cast,
-- `any (select ...)` se lee como subconsulta de filas y compara uuid con uuid[].

-- Orgs del usuario actual. Un array y no un escalar: hoy es una sola, pero la
-- política no cambia si mañana alguien pertenece a varias.
create or replace function public.auth_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(a.org_id), '{}')
  from public.analysts a
  join public.organizations o on o.id = a.org_id
  where a.user_id = auth.uid()
    and a.disabled_at is null
    and o.disabled_at is null;
$$;

-- Admin de PLATAFORMA: ve y actúa sobre todas las orgs.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.analysts a
    where a.user_id = auth.uid()
      and a.role = 'admin'
      and a.disabled_at is null
  );
$$;

-- is_analyst ahora ignora a los deshabilitados. Mismo nombre y firma: el
-- `create or replace` conserva los grants de 0024.
create or replace function public.is_analyst()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.analysts a
    where a.user_id = auth.uid() and a.disabled_at is null
  );
$$;

-- 0024 ya quitó el EXECUTE por defecto a PUBLIC en las funciones nuevas, así
-- que `authenticated` necesita el grant explícito: sin él, TODA lectura del
-- panel falla con "permission denied for function".
revoke execute on function public.auth_org_ids()      from public;
revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.audit_log_fill_org() from public;
grant  execute on function public.auth_org_ids()      to authenticated, service_role;
grant  execute on function public.is_platform_admin() to authenticated, service_role;

-- ------------------------------------------------------------
-- Políticas
-- ------------------------------------------------------------
-- Sigue sin haber políticas de escritura: todo escribe por service-role y la
-- app verifica la org antes (lib/auth/tenant.ts).

alter table public.organizations enable row level security;
create policy organizations_select on public.organizations
  for select to authenticated
  using ((select public.is_platform_admin()) or id = any ((select public.auth_org_ids())::uuid[]));
grant select on public.organizations to authenticated;
grant all    on public.organizations to service_role;

-- analysts: la propia fila (para resolver la sesión, aunque esté a medio 2FA)
-- o todas si es admin (para nombrar a los usuarios en el panel).
drop policy if exists analysts_select_self on public.analysts;
create policy analysts_select on public.analysts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

-- Dueños directos.
drop policy if exists kyb_requests_select on public.kyb_requests;
create policy kyb_requests_select on public.kyb_requests
  for select to authenticated
  using ((select public.is_platform_admin()) or org_id = any ((select public.auth_org_ids())::uuid[]));

drop policy if exists forms_select on public.forms;
create policy forms_select on public.forms
  for select to authenticated
  using ((select public.is_platform_admin()) or org_id = any ((select public.auth_org_ids())::uuid[]));

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using ((select public.is_platform_admin()) or org_id = any ((select public.auth_org_ids())::uuid[]));

-- Hijas de una solicitud: heredan la RLS de kyb_requests a través del EXISTS
-- (la subconsulta corre con la política de kyb_requests aplicada). Ninguna
-- política de kyb_requests mira a estas tablas, así que no hay recursión.
drop policy if exists kyb_form_responses_select on public.kyb_form_responses;
create policy kyb_form_responses_select on public.kyb_form_responses
  for select to authenticated
  using (exists (select 1 from public.kyb_requests r where r.id = request_id));

drop policy if exists kyb_documents_select on public.kyb_documents;
create policy kyb_documents_select on public.kyb_documents
  for select to authenticated
  using (exists (select 1 from public.kyb_requests r where r.id = request_id));

drop policy if exists aml_checks_select on public.aml_checks;
create policy aml_checks_select on public.aml_checks
  for select to authenticated
  using (exists (select 1 from public.kyb_requests r where r.id = request_id));

drop policy if exists answer_translations_select on public.answer_translations;
create policy answer_translations_select on public.answer_translations
  for select to authenticated
  using (exists (select 1 from public.kyb_requests r where r.id = request_id));

-- El panel lee estas tres con service-role, así que por PostgREST quedan solo
-- para el admin. Antes cualquier analista las leía con la anon key pública,
-- incluidos los payloads de webhook (con datos del solicitante).
drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists ai_model_prices_select on public.ai_model_prices;
create policy ai_model_prices_select on public.ai_model_prices
  for select to authenticated
  using ((select public.is_platform_admin()));

-- ------------------------------------------------------------
-- Consumo de DIDIT por org
-- ------------------------------------------------------------
-- Solo conteos: DIDIT no informa precio por check y la tarifa es contractual.
-- `billable_selects` son los "Validar empresa" cuyo select se intentó (cobrado,
-- o sin confirmar si se cobró).
-- security_invoker: por PostgREST aplica la RLS de quien consulta.
create view public.didit_usage
with (security_invoker = true)
as
select
  r.org_id,
  date_trunc('month', c.created_at)       as month,
  coalesce(c.feature, 'aml_screening')    as feature,
  c.status,
  count(*)::int                           as checks,
  (count(*) filter (
    where c.feature = 'kyb_registry'
      and c.result -> 'selected' ->> 'billing_state' in ('charged', 'unknown')
  ))::int                                 as billable_selects
from public.aml_checks c
join public.kyb_requests r on r.id = c.request_id
where c.provider = 'didit'
group by 1, 2, 3, 4;

grant select on public.didit_usage to authenticated, service_role;

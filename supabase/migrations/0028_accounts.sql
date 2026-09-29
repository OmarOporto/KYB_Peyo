-- =============================================================
-- Gestión de cuentas: suspensión con contacto, guardas de admins y
-- revocación de sesiones.
-- -------------------------------------------------------------
-- La suspensión es `disabled_at` (usuario u organización) SIN ban de Supabase
-- Auth: la persona sigue pudiendo iniciar sesión para ver la pantalla de
-- "cuenta suspendida" con el email de contacto, pero la app la frena y la RLS
-- no le deja leer nada (auth_org_ids ya excluye usuarios y orgs deshabilitados).
-- =============================================================

-- ------------------------------------------------------------
-- Quién suspendió y a quién contactar
-- ------------------------------------------------------------
-- El contacto se guarda como id del admin elegido y no como email copiado: se
-- muestra su email ACTUAL (el trigger de 0026 mantiene analysts.email al día).
alter table public.analysts
  add column suspended_by uuid references auth.users(id) on delete set null,
  add column suspension_contact_id uuid references public.analysts(user_id) on delete set null,
  add constraint analysts_suspension_fields
    check (disabled_at is not null or (suspended_by is null and suspension_contact_id is null));

alter table public.organizations
  add column suspended_by uuid references auth.users(id) on delete set null,
  add column suspension_contact_id uuid references public.analysts(user_id) on delete set null,
  add constraint organizations_suspension_fields
    check (disabled_at is not null or (suspended_by is null and suspension_contact_id is null));

-- "Acme" y "ACME" son la misma org: el unique de 0025 distingue mayúsculas.
create unique index organizations_name_lower_key on public.organizations (lower(name));

-- ------------------------------------------------------------
-- Sesión viva
-- ------------------------------------------------------------
-- Revocar sesiones (el admin define una contraseña, "cerrar otras sesiones")
-- borra la fila de auth.sessions, pero el access token ya emitido sigue
-- valiendo contra PostgREST hasta que vence (1 h). Con esto la RLS lo corta al
-- instante: el JWT tiene que apuntar a una sesión que todavía exista.
create or replace function public.session_alive()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;

revoke execute on function public.session_alive() from public;
grant  execute on function public.session_alive() to authenticated, service_role;

-- Los helpers de RLS suman la sesión viva. is_platform_admin además exige que
-- la org del admin esté habilitada (antes la ignoraba), e is_analyst se alinea
-- con los demás (org habilitada, 2FA). `create or replace` conserva los grants.
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
    and o.disabled_at is null
    and public.mfa_ok()
    and public.session_alive();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.analysts a
    join public.organizations o on o.id = a.org_id
    where a.user_id = auth.uid()
      and a.role = 'admin'
      and a.disabled_at is null
      and o.disabled_at is null
  ) and public.mfa_ok() and public.session_alive();
$$;

create or replace function public.is_analyst()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.analysts a
    join public.organizations o on o.id = a.org_id
    where a.user_id = auth.uid()
      and a.disabled_at is null
      and o.disabled_at is null
  ) and public.mfa_ok() and public.session_alive();
$$;

-- ------------------------------------------------------------
-- Guardas: nunca cero admins activos
-- ------------------------------------------------------------
-- En la base y no solo en la app: cubre el panel, el script de provisión y el
-- editor SQL, y es a prueba de carreras. El advisory lock serializa todos los
-- cambios de cuentas; como cada sentencia de plpgsql toma un snapshot nuevo
-- (READ COMMITTED), la segunda transacción ve lo que commiteó la primera. Sin
-- el lock, dos admins suspendiéndose a la vez verían "hay otro admin" los dos.
--
-- "Admin activo" = rol admin, no suspendido y con la org habilitada.
-- Los errores llevan como mensaje la clave que la app traduce.
create or replace function public.accounts_guard_analysts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_active boolean := false;
  old_active boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('kyb.accounts'));

  if tg_op in ('INSERT', 'UPDATE') then
    new_active := new.role = 'admin' and new.disabled_at is null;
    -- Un admin activo en una org suspendida quedaría afuera sin saberlo.
    if new_active and not exists (
      select 1 from public.organizations o where o.id = new.org_id and o.disabled_at is null
    ) then
      raise exception 'admin_org_suspended';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    old_active := old.role = 'admin' and old.disabled_at is null and exists (
      select 1 from public.organizations o where o.id = old.org_id and o.disabled_at is null
    );
    if old_active and not new_active and not exists (
      select 1
      from public.analysts a
      join public.organizations o on o.id = a.org_id
      where a.user_id <> old.user_id
        and a.role = 'admin'
        and a.disabled_at is null
        and o.disabled_at is null
    ) then
      raise exception 'last_admin';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger accounts_guard_analysts
  before insert or update of role, disabled_at, org_id or delete on public.analysts
  for each row execute function public.accounts_guard_analysts();

-- Una org con admins activos no se suspende: se quedarían afuera (y con ellos,
-- posiblemente, el último admin).
create or replace function public.accounts_guard_orgs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('kyb.accounts'));
  if new.disabled_at is not null and old.disabled_at is null and exists (
    select 1 from public.analysts a
    where a.org_id = new.id and a.role = 'admin' and a.disabled_at is null
  ) then
    raise exception 'org_has_admins';
  end if;
  return new;
end;
$$;

create trigger accounts_guard_orgs
  before update of disabled_at on public.organizations
  for each row execute function public.accounts_guard_orgs();

revoke execute on function public.accounts_guard_analysts() from public;
revoke execute on function public.accounts_guard_orgs() from public;

-- ------------------------------------------------------------
-- Revocar sesiones de un usuario
-- ------------------------------------------------------------
-- Borra todas sus sesiones (los refresh tokens caen en cascada). Con
-- session_alive() la RLS lo corta en el acto; la app, en el próximo getUser().
-- SOLO service_role: lo usa el admin al definir una contraseña.
create or replace function public.admin_revoke_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.admin_revoke_sessions(uuid) to service_role;

-- ------------------------------------------------------------
-- Quién tiene 2FA
-- ------------------------------------------------------------
-- listUsers de GoTrue no trae los factores; la página Usuarios los lee de acá
-- en una sola consulta. SOLO service_role.
create or replace function public.admin_mfa_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct user_id from auth.mfa_factors where status = 'verified';
$$;

revoke execute on function public.admin_mfa_user_ids() from public, anon, authenticated;
grant  execute on function public.admin_mfa_user_ids() to service_role;

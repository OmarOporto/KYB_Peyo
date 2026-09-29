-- =============================================================
-- Seguridad de la cuenta: 2FA exigido también en la base, verificación de la
-- contraseña actual y email sincronizado.
-- =============================================================

-- ------------------------------------------------------------
-- 2FA (TOTP) en la RLS
-- ------------------------------------------------------------
-- El 2FA es opcional, pero quien lo activa tiene que usarlo SIEMPRE. La app
-- lo exige en requireAnalyst; esto lo exige también en la base, porque con la
-- anon key (pública) y una sesión de solo contraseña (aal1) se podría leer por
-- PostgREST sin pasar por la app.
--
-- Verdadero si la sesión ya pasó el segundo factor (aal2) o si el usuario no
-- tiene ningún factor verificado.
create or replace function public.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

-- Los helpers de 0025 pasan a exigirlo. Las tablas hijas lo heredan a través
-- de kyb_requests. La propia fila de `analysts` NO lo exige a propósito: la app
-- necesita leerla a aal1 para mandar al paso del código en vez de a
-- "sin acceso".
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
    and public.mfa_ok();
$$;

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
  ) and public.mfa_ok();
$$;

revoke execute on function public.mfa_ok() from public;
grant  execute on function public.mfa_ok() to authenticated, service_role;

-- ------------------------------------------------------------
-- Verificar la contraseña actual
-- ------------------------------------------------------------
-- Cambiar la contraseña o el email desde Seguridad pide la actual. Supabase
-- Auth no lo exige por su cuenta (`reauthenticate()` no pide nada dentro de
-- las primeras 24 h de sesión), y un login efímero desde el servidor
-- compartiría el rate limit por IP de Vercel y no pasaría el captcha.
--
-- SOLO service_role: si `authenticated` pudiera ejecutarla, cualquiera con
-- sesión podría probar contraseñas de otros usuarios. El server la llama
-- detrás de un rate limit por usuario (app/admin/(dash)/security/actions.ts).
create or replace function public.verify_user_password(p_user_id uuid, p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
      from auth.users u
      where u.id = p_user_id
        and coalesce(u.encrypted_password, '') <> ''
    ),
    false
  );
$$;

revoke execute on function public.verify_user_password(uuid, text) from public, anon, authenticated;
grant  execute on function public.verify_user_password(uuid, text) to service_role;

-- ------------------------------------------------------------
-- Email del analista = email de Auth
-- ------------------------------------------------------------
-- `analysts.email` es una copia (la usa la auditoría y el panel). Cuando el
-- usuario cambia su email (con doble confirmación), la copia se actualiza sola.
create or replace function public.sync_analyst_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.analysts set email = new.email where user_id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_analyst_email() from public;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sync_analyst_email();

-- Seed para desarrollo local (se ejecuta en `supabase db reset`).

-- Dos organizaciones para poder probar el aislamiento: Peyo (la de la
-- plataforma, creada por 0025_organizations.sql) y un cliente de demo.
insert into public.organizations (id, slug, name)
values ('00000000-0000-4000-8000-000000000002', 'acme-demo', 'Acme Demo')
on conflict (id) do nothing;

-- API keys de prueba, una por org. Tokens en claro (usar como Bearer en curl):
--   kyb_test_key_local_dev  -> Peyo
--   kyb_test_key_acme_dev   -> Acme Demo
-- Guardamos solo el hash sha256 (igual a lib/tokens.ts::hashToken).
insert into public.api_keys (key_hash, label, org_id)
values
  (encode(digest('kyb_test_key_local_dev', 'sha256'), 'hex'), 'seed-local',
   '00000000-0000-4000-8000-000000000001'),
  (encode(digest('kyb_test_key_acme_dev', 'sha256'), 'hex'), 'seed-acme',
   '00000000-0000-4000-8000-000000000002')
on conflict (key_hash) do nothing;

-- Los usuarios del panel se crean con scripts/provision-users.mjs (Auth Admin
-- API), a partir de scripts/provision/users.json.

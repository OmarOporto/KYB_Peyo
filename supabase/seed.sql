-- Seed para desarrollo local (se ejecuta en `supabase db reset`).

-- API key de prueba para la app principal.
-- Token en claro: kyb_test_key_local_dev  (usar como Bearer en curl)
-- Guardamos solo el hash sha256 (igual a lib/tokens.ts::hashToken).
insert into public.api_keys (key_hash, label)
values (encode(digest('kyb_test_key_local_dev', 'sha256'), 'hex'), 'seed-local')
on conflict (key_hash) do nothing;

-- El analista de prueba se crea con scripts/seed-admin.mjs (Auth Admin API):
--   analyst@kyb.local / password123

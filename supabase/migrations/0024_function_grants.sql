-- =============================================================
-- Cierra el EXECUTE por defecto de las funciones SECURITY DEFINER.
--
-- Postgres otorga EXECUTE a PUBLIC en toda función nueva. En una función
-- SECURITY DEFINER eso significa que cualquier rol —incluido `anon`, que llega
-- por PostgREST en /rest/v1/rpc/...— puede ejecutarla con los privilegios del
-- dueño. 0013 otorgó EXECUTE a service_role pero nunca revocó ese default.
--
-- `consume_api_key` era el caso concreto: con el uuid de una key (visible en
-- las URLs del panel, /admin/clients/<id>/webhooks) un anónimo podía inflarle
-- los contadores a un cliente hasta agotarle el rate limit.
-- =============================================================

-- Cuidado con is_analyst(): la ejecutan las políticas RLS con el rol que
-- consulta, así que `authenticated` DEBE conservar el EXECUTE o el panel deja
-- de leer nada. Lo que se quita es el acceso de PUBLIC (anon incluido).
revoke execute on function public.is_analyst() from public;
grant  execute on function public.is_analyst() to authenticated, service_role;

-- consume_api_key solo la llama el servidor con service-role; nadie más.
revoke execute on function public.consume_api_key(uuid, integer) from public;
grant  execute on function public.consume_api_key(uuid, integer) to service_role;

-- Las futuras funciones ya no nacen con EXECUTE para PUBLIC. No afecta a las
-- existentes (por eso los revoke explícitos de arriba).
alter default privileges in schema public revoke execute on functions from public;

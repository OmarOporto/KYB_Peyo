-- Las tablas creadas después de 0001 (0008 api_key_usage/api_rate_counters,
-- 0010 webhook_endpoints, 0011 idempotency_keys) NO heredaron el grant a
-- service_role de 0001 → "permission denied". Se re-otorga sobre todo lo
-- existente y se fijan default privileges para que las futuras tablas hereden.
-- (Solo service_role: estas tablas son secretas; authenticated queda sin acceso,
-- reforzado por RLS sin políticas.)
grant all on all tables      in schema public to service_role;
grant all on all sequences   in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all     on tables    to service_role;
alter default privileges in schema public grant all     on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Resultados de verificación por-feature (DIDIT).
-- Se reutiliza aml_checks como tabla de "verification checks": ya tiene
-- provider / external_ref / status / result. Se agregan columnas para
-- distinguir la feature de DIDIT, el campo de origen y un score opcional.
alter table public.aml_checks
  add column if not exists feature   text,
  add column if not exists field_key text,
  add column if not exists score     numeric;

create index if not exists aml_checks_feature_idx
  on public.aml_checks (request_id, feature);

-- =============================================================
-- Traducción de respuestas con IA
-- -------------------------------------------------------------
-- Traducir respuestas manda datos del solicitante (PII) a un proveedor externo,
-- así que es OPT-IN por cliente y arranca apagado. Sin el flag, la API ignora
-- `?translate=1` y responde igual que siempre.
-- =============================================================
alter table public.api_keys
  add column if not exists allow_ai_translation boolean not null default false;

-- Caché de traducciones de respuestas de texto libre.
-- `source_hash` es el hash del texto ORIGEN: si el solicitante corrige su
-- respuesta, el hash cambia y se vuelve a traducir sola. Además hace que el
-- mismo texto se traduzca una vez y siempre igual (consistencia, no solo ahorro).
create table if not exists public.answer_translations (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.kyb_requests(id) on delete cascade,
  field_key     text not null,
  target_locale text not null,
  source_hash   text not null,
  text          text not null,
  model         text,
  created_at    timestamptz not null default now(),
  unique (request_id, field_key, target_locale, source_hash)
);

create index if not exists answer_translations_request_idx
  on public.answer_translations(request_id, target_locale);

alter table public.answer_translations enable row level security;

-- Lectura para analistas; escrituras por service-role (como el resto del admin).
create policy answer_translations_select on public.answer_translations
  for select to authenticated using (public.is_analyst());

grant all on public.answer_translations to service_role;
grant select on public.answer_translations to authenticated;

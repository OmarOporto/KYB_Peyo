-- =============================================================
-- Plantillas de formulario importadas (ej. desde DIDIT)
-- =============================================================
create table public.form_templates (
  id          uuid primary key default gen_random_uuid(),
  source      text not null default 'didit',   -- origen (didit, manual, …)
  source_ref  text,                             -- uuid del questionnaire en DIDIT
  name        text not null,
  definition  jsonb not null,                   -- NormalizedQuestionnaire
  created_at  timestamptz not null default now()
);
create index form_templates_source_idx on public.form_templates(source, source_ref);

alter table public.form_templates enable row level security;

-- Lectura para analistas; escrituras por service-role (server-side).
create policy form_templates_select on public.form_templates
  for select to authenticated using (public.is_analyst());

grant all on public.form_templates to service_role;
grant select on public.form_templates to authenticated;

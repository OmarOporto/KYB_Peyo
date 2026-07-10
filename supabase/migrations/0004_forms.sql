-- =============================================================
-- Formularios editables (builder) — reemplaza form_templates
-- =============================================================
drop table if exists public.form_templates;

create table public.forms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  definition  jsonb not null,                 -- FormDefinition
  source      text not null default 'manual' check (source in ('manual', 'didit')),
  source_ref  text,                           -- uuid del workflow/questionnaire DIDIT (si aplica)
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index forms_status_idx on public.forms(status);
create index forms_source_idx on public.forms(source, source_ref);

create trigger forms_updated_at
  before update on public.forms
  for each row execute function public.set_updated_at();

alter table public.forms enable row level security;

-- Lectura para analistas; escrituras por service-role (server-side, como el resto del admin).
create policy forms_select on public.forms
  for select to authenticated using (public.is_analyst());

grant all on public.forms to service_role;
grant select on public.forms to authenticated;

-- La solicitud puede apuntar a un formulario publicado.
alter table public.kyb_requests
  add column form_id uuid references public.forms(id);

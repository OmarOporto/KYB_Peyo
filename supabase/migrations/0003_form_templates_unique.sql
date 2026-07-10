-- =============================================================
-- form_templates: unicidad por origen + updated_at
-- =============================================================
alter table public.form_templates
  add constraint form_templates_source_ref_uniq unique (source, source_ref);

alter table public.form_templates
  add column updated_at timestamptz not null default now();

create trigger form_templates_updated_at
  before update on public.form_templates
  for each row execute function public.set_updated_at();

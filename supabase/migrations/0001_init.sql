-- =============================================================
-- KYB service — esquema inicial
-- =============================================================
create extension if not exists "pgcrypto";

-- ---------- helper: updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
-- Analistas (ligados a Supabase Auth)
-- =============================================================
create table public.analysts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'analyst' check (role in ('analyst','admin')),
  created_at timestamptz not null default now()
);

-- ¿El usuario autenticado es analista? (SECURITY DEFINER para evitar recursión RLS)
create or replace function public.is_analyst()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.analysts a where a.user_id = auth.uid());
$$;

-- =============================================================
-- API keys (auth máquina-a-máquina para la app principal)
-- =============================================================
create table public.api_keys (
  id         uuid primary key default gen_random_uuid(),
  key_hash   text not null unique,
  label      text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- =============================================================
-- Solicitudes KYB
-- =============================================================
create table public.kyb_requests (
  id                    uuid primary key default gen_random_uuid(),
  external_ref          text not null,
  status                text not null default 'created'
                        check (status in ('created','in_progress','submitted','under_review','approved','rejected','expired')),
  invitation_token_hash text not null unique,
  token_expires_at      timestamptz,
  form_version          text not null default 'v1',
  created_at            timestamptz not null default now(),
  submitted_at          timestamptz,
  decided_at            timestamptz,
  decision              text check (decision in ('approved','rejected')),
  decided_by            uuid references public.analysts(user_id)
);
create index kyb_requests_external_ref_idx on public.kyb_requests(external_ref);
create index kyb_requests_status_idx on public.kyb_requests(status);

-- =============================================================
-- Respuestas del formulario (JSONB, validado por Zod por versión)
-- =============================================================
create table public.kyb_form_responses (
  request_id   uuid primary key references public.kyb_requests(id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  form_version text not null default 'v1',
  updated_at   timestamptz not null default now()
);
create trigger kyb_form_responses_updated_at
  before update on public.kyb_form_responses
  for each row execute function public.set_updated_at();

-- =============================================================
-- Documentos (metadatos; el binario vive en Storage)
-- =============================================================
create table public.kyb_documents (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.kyb_requests(id) on delete cascade,
  doc_type     text not null,
  storage_path text not null,
  filename     text not null,
  mime         text,
  size         bigint,
  uploaded_at  timestamptz not null default now()
);
create index kyb_documents_request_idx on public.kyb_documents(request_id);

-- =============================================================
-- Checks AML (DIDIT)
-- =============================================================
create table public.aml_checks (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.kyb_requests(id) on delete cascade,
  provider     text not null default 'didit',
  external_ref text,
  status       text not null default 'pending'
               check (status in ('pending','passed','flagged','error')),
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index aml_checks_request_idx on public.aml_checks(request_id);
create trigger aml_checks_updated_at
  before update on public.aml_checks
  for each row execute function public.set_updated_at();

-- =============================================================
-- Auditoría
-- =============================================================
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid references public.kyb_requests(id) on delete set null,
  actor       text not null,           -- 'system' | 'applicant' | analyst email
  action      text not null,
  from_status text,
  to_status   text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_request_idx on public.audit_log(request_id);

-- =============================================================
-- RLS
-- Escrituras del solicitante y del admin pasan por service-role
-- (server-side), por eso las políticas solo cubren SELECT para analistas.
-- =============================================================
alter table public.analysts           enable row level security;
alter table public.api_keys           enable row level security;
alter table public.kyb_requests       enable row level security;
alter table public.kyb_form_responses enable row level security;
alter table public.kyb_documents      enable row level security;
alter table public.aml_checks         enable row level security;
alter table public.audit_log          enable row level security;

-- analysts: cada quien ve su propia fila (para resolver el rol en la app)
create policy analysts_select_self on public.analysts
  for select to authenticated using (user_id = auth.uid());

-- Lectura para analistas en tablas KYB
create policy kyb_requests_select on public.kyb_requests
  for select to authenticated using (public.is_analyst());
create policy kyb_form_responses_select on public.kyb_form_responses
  for select to authenticated using (public.is_analyst());
create policy kyb_documents_select on public.kyb_documents
  for select to authenticated using (public.is_analyst());
create policy aml_checks_select on public.aml_checks
  for select to authenticated using (public.is_analyst());
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_analyst());
-- api_keys: sin políticas -> solo accesible por service-role.

-- =============================================================
-- Storage: bucket privado para documentos KYB
-- =============================================================
insert into storage.buckets (id, name, public)
values ('kyb-documents', 'kyb-documents', false)
on conflict (id) do nothing;

-- =============================================================
-- Grants
-- service_role: escrituras server-side (bypassa RLS).
-- authenticated: lecturas del panel (RLS decide qué filas).
-- =============================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select on all tables in schema public to authenticated;

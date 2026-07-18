-- Webhooks registrados por cliente (anti-SSRF) con secreto cifrado por endpoint.
-- El cliente ya no envía una URL arbitraria en cada request: registra endpoints
-- validados y las solicitudes referencian webhook_endpoint_id.

create table if not exists public.webhook_endpoints (
  id               uuid primary key default gen_random_uuid(),
  api_key_id       uuid not null references public.api_keys(id) on delete cascade,
  url              text not null,
  -- Secreto de firma CIFRADO (AES-256-GCM). No se puede hashear: se necesita en
  -- claro para firmar cada entrega. Ver lib/crypto/secretBox.ts.
  secret_encrypted text not null,
  secret_last4     text,
  enabled          boolean not null default true,
  created_at       timestamptz not null default now(),
  rotated_at       timestamptz
);
create index if not exists webhook_endpoints_api_key_idx
  on public.webhook_endpoints (api_key_id);

-- RLS: sin políticas -> solo service-role (como api_keys).
alter table public.webhook_endpoints enable row level security;

-- La solicitud referencia el endpoint registrado (reemplaza callback_url, que
-- queda deprecado pero se conserva para no romper datos existentes).
alter table public.kyb_requests
  add column if not exists webhook_endpoint_id uuid references public.webhook_endpoints(id);

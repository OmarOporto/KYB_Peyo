# Servicio KYB

Servicio externo de validación de empresas (KYB). Formulario grande por invitación,
integración AML con DIDIT, y panel de revisión para analistas. Next.js + Supabase.

## Arquitectura

Tres superficies sobre una app Next.js (App Router) + Supabase:

1. **Formulario público** (`/f/[token]`) — acceso por token de invitación, sin cuenta.
   Autosave y subida de documentos. Todo pasa por Server Actions con el cliente
   service-role (server-only); el token es el gatekeeper.
2. **API máquina-a-máquina** (`/api/v1/kyb/...`) — para la app principal. Auth por API key.
3. **Panel de revisión** (`/admin`) — analistas con Supabase Auth + RLS.

### Flujo

1. App principal → `POST /api/v1/kyb/requests` (API key) → recibe `invitationUrl` + `token`.
2. Usuario llena `/f/[token]`, sube documentos, envía.
3. Al enviar se dispara el check AML (mock en local / DIDIT en prod); estado → `under_review`.
4. App principal → `GET /api/v1/kyb/requests/:id` → estado + resultado + AML.
5. Analista revisa en `/admin` y aprueba/rechaza.

## Requisitos

- Node 20+ / 22+, npm
- **Docker Desktop** (para Supabase local)

## Puesta en marcha (local)

```bash
npm install
cp .env.example .env.local          # completar claves (ver abajo)

npm run db:start                    # levanta Supabase (Docker). Imprime ANON_KEY / SERVICE_ROLE_KEY
# copiar esas claves a .env.local si difieren

npm run db:reset                    # aplica migraciones + seed (api key de prueba)
npm run seed:admin                  # crea analista: analyst@kyb.local / password123

npm run dev                         # http://localhost:3000
```

Studio de Supabase: http://127.0.0.1:54323

### Variables de entorno

Ver `.env.example`. Claves relevantes:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` — base para construir el `invitationUrl`
- `AML_PROVIDER` — `mock` (local) | `didit` (prod)
- `DIDIT_API_URL`, `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` — solo con `AML_PROVIDER=didit`

## API

Crear solicitud:

```bash
curl -X POST http://localhost:3000/api/v1/kyb/requests \
  -H "Authorization: Bearer kyb_test_key_local_dev" \
  -H "Content-Type: application/json" \
  -d '{"external_ref":"emp-123"}'
```

Consultar estado:

```bash
curl http://localhost:3000/api/v1/kyb/requests/<id> \
  -H "Authorization: Bearer kyb_test_key_local_dev"
```

> La API key de prueba (`kyb_test_key_local_dev`) se siembra en `supabase/seed.sql`.
> En producción, genera keys reales (hash sha256 en `api_keys`).

## DIDIT (AML) — por definir

La integración está aislada en `lib/aml/` (`provider.ts`, `didit.ts`, `mock.ts`, `mapping.ts`).
Falta por confirmar con DIDIT: endpoints, credenciales, formato del webhook y qué campos
del formulario se envían (`lib/aml/mapping.ts`). El resultado asíncrono llega a
`POST /api/webhooks/didit` (firma HMAC-SHA256).

## Producción (resumen)

- `supabase link` + `supabase db push` a un proyecto Supabase Cloud.
- Deploy de la app en Vercel con las env vars de producción.
- `AML_PROVIDER=didit` + credenciales reales.

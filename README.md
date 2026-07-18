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

Body opcional: `ttl_hours`, `form_id` (UUID del formulario publicado a usar),
`callback_url` (webhook server-to-server, ver abajo) y `return_url` (a dónde
redirigir el navegador del usuario tras enviar, ver "Reanudación y redirect").

Consultar estado:

```bash
curl http://localhost:3000/api/v1/kyb/requests/<id> \
  -H "Authorization: Bearer kyb_test_key_local_dev"
```

### Endpoints del cliente (todos con `Authorization: Bearer <key>`, aislados por key)

| Método | Ruta | Qué devuelve |
|---|---|---|
| `POST` | `/api/v1/kyb/requests` | Crea la solicitud → `{ id, invitationUrl, token, expiresAt }` |
| `GET` | `/api/v1/kyb/requests` | **Lista** sus solicitudes. Query: `status`, `external_ref`, `limit` (máx 100), `offset` → `{ data, limit, offset, total }` |
| `GET` | `/api/v1/kyb/requests/:id` | Estado + decisión + `aml[]` |
| `GET` | `/api/v1/kyb/requests/:id/answers` | Respuestas mapeadas a etiquetas (`?locale=`); file/selfie con URLs firmadas |
| `GET` | `/api/v1/kyb/requests/:id/documents` | Documentos con URLs firmadas (`?expires_in=`, seg) |
| `GET` | `/api/v1/kyb/requests/:id/draft` | Avance del borrador: `{ filled, total, percent, fields[] }` |
| `POST` | `/api/v1/kyb/requests/:id/invitation` | Re-emite el link (mismo borrador) si se perdió/expiró → nuevo `invitationUrl` |

> La API key de prueba (`kyb_test_key_local_dev`) se siembra en `supabase/seed.sql`.
> En producción se gestionan desde el panel **Clientes API** (`/admin/clients`):
> emitir (se muestra el texto una sola vez), rotar, revocar, fijar rate limit y ver uso.

### Aislamiento por cliente

Cada solicitud queda ligada a la API key que la creó (`kyb_requests.api_key_id`).
El `GET /:id` solo devuelve solicitudes de **esa** key (404 si no es suya). Los
intakes públicos (`/forms/[id]`) no tienen dueño y no son accesibles por la API.

### Rate limiting

Por API key. Límite configurable por key (panel) o el default global
`API_RATE_LIMIT_DEFAULT_PER_MIN` (60). Al exceder: `429 {"error":"rate_limited"}`
con headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`.

### Webhook saliente (push de resultados)

El cliente **registra sus endpoints** en el panel (`/admin/clients/<id>/webhooks`):
solo `https`, puerto 443, y se **rechazan IPs privadas/loopback/link-local**
(anti-SSRF). Cada endpoint tiene su **propio secreto** (cifrado en reposo,
mostrado en claro una sola vez). Al crear la solicitud se pasa
`webhook_endpoint_id` (no una URL arbitraria).

Se hace `POST` al endpoint cuando:
- `verification.completed` — terminan las verificaciones DIDIT/AML (`under_review`).
- `decision.made` — el analista aprueba/rechaza.

Body = shape del `GET` + `event` + `event_id` + `sent_at`. Headers:
`x-kyb-timestamp`, `x-kyb-event-id`, `x-kyb-delivery-id`, y
`x-kyb-signature: v1=<hex>` donde `<hex> = HMAC-SHA256(secret, timestamp + "." + rawBody)`.

**Verificación del receptor**: recomputar la firma (comparación en tiempo
constante), **rechazar timestamps > 5 min** (anti-replay), **deduplicar por
`event_id`** y procesar de forma **idempotente**. No se siguen redirects; timeout
corto; hasta 3 reintentos; el polling del `GET` es el respaldo. Entregas en
`audit_log` (`webhook_delivered` / `webhook_failed`).

### Reanudación y redirect

- **Reanudar a medias**: el formulario autosalva el borrador. Si el usuario se sale
  y **el cliente lo manda de vuelta al mismo `invitationUrl`** (mientras la solicitud
  esté `created`/`in_progress`), se **restauran los datos** llenados. El token dura 14
  días (`ttl_hours` configurable). Si se perdió o expiró, `POST /:id/invitation`
  genera un link nuevo conservando el borrador.
- **Redirect al terminar**: si al crear se pasó `return_url`, al enviar el formulario
  el navegador del usuario se redirige a esa URL (botón + auto-redirect). Es distinto
  de `callback_url` (webhook server-to-server); `return_url` es el redirect del
  **navegador** del usuario final.

## DIDIT (AML) — por definir

La integración está aislada en `lib/aml/` (`provider.ts`, `didit.ts`, `mock.ts`, `mapping.ts`).
Falta por confirmar con DIDIT: endpoints, credenciales, formato del webhook y qué campos
del formulario se envían (`lib/aml/mapping.ts`). El resultado asíncrono llega a
`POST /api/webhooks/didit` (firma HMAC-SHA256).

## Producción (resumen)

- `supabase link` + `supabase db push` a un proyecto Supabase Cloud.
- Deploy de la app en Vercel con las env vars de producción.
- `AML_PROVIDER=didit` + credenciales reales.

# Integración con la API KYB de Peyo

Guía para consumir uno de nuestros formularios KYB desde tu aplicación. Cubre
autenticación, todos los endpoints, el flujo del usuario final, webhooks
(registro + verificación de firma), rate limiting y manejo de errores.

---

## 1. Qué te entregamos nosotros

Antes de integrar, te proporcionamos:

| Dato | Descripción |
|---|---|
| `KYB_BASE_URL` | Base de la API. Ej. `https://kyb-peyo.vercel.app` |
| `API_KEY` | Tu clave secreta (`kyb_…`). **Se muestra una sola vez**; guárdala como secreto server-side. |
| `FORM_ID` | UUID del formulario publicado que usarán tus usuarios. |
| `WEBHOOK_ENDPOINT_ID` + `WEBHOOK_SECRET` | (Opcional, si usarás webhooks) Se generan cuando registramos **tu** URL de webhook. El secreto se muestra una sola vez. |
| Rate limit | Cuota de req/min de tu key (por defecto 60). |

> **Nunca** pongas la `API_KEY` en el frontend ni en repositorios. Solo server-to-server, siempre por HTTPS.

> **De dónde salen estos valores** (nuestro lado): en el panel admin, sección
> **Clientes API → \<cliente\> → Configuración de integración**. Ahí se copian
> `KYB_BASE_URL`, `KYB_FORM_ID` y `KYB_WEBHOOK_ENDPOINT_ID`, y hay un botón
> "Copiar bloque .env". La `KYB_API_KEY` y el `KYB_WEBHOOK_SECRET` se muestran
> **una sola vez** al emitir/rotar (no se pueden recuperar; si se pierden, se rotan).

---

## 2. Autenticación

Todas las llamadas llevan la cabecera:

```
Authorization: Bearer <API_KEY>
```

- Sin cabecera o key inválida/revocada → `401 { "error": "unauthorized" }`.
- Cada key **solo ve sus propias solicitudes** (aislamiento por cliente). Pedir una solicitud que no es tuya → `404`.

---

## 3. Flujo de integración (resumen)

```
1. POST /api/v1/kyb/requests           → creas la solicitud, recibes invitationUrl
2. Rediriges a tu usuario a invitationUrl  → llena el formulario (autosave, reanudable)
3a. Recibes el resultado por WEBHOOK (push)   ── recomendado
3b. …o haces polling de GET /api/v1/kyb/requests/:id
4. Consultas detalle: /answers, /documents, /draft según necesites
```

---

## 4. Endpoints

Base: `KYB_BASE_URL/api/v1/kyb`

### 4.1 Crear solicitud — `POST /requests`

**Body (JSON):**

| Campo | Tipo | Req. | Descripción |
|---|---|---|---|
| `external_ref` | string (≤100) | **sí** | Tu identificador interno de la entidad/usuario. Se te devuelve tal cual. |
| `form_id` | uuid | no* | Formulario a usar. Usa el `FORM_ID` que te dimos. |
| `webhook_endpoint_id` | uuid | no | Endpoint de webhook registrado (ver §6). |
| `return_url` | string (https, ≤2048) | no | A dónde redirigir el navegador del usuario tras enviar. |
| `ttl_hours` | int > 0 | no | Vigencia del link de invitación (default 14 días). |

**Cabecera opcional:** `Idempotency-Key: <valor-único>` — si reintentas con la misma
key y el mismo body, devolvemos la respuesta original (no se duplica la solicitud).

**Respuesta `201`:**

```json
{
  "id": "uuid-de-la-solicitud",
  "invitationUrl": "https://kyb-peyo.vercel.app/f/<token>",
  "token": "<token-de-invitación>",
  "expiresAt": "2026-08-01T12:00:00.000Z",
  "status": "created"
}
```

Guarda el `id` (para consultar) y el `invitationUrl` (para tu usuario).

**Ejemplo:**

```bash
curl -X POST "$KYB_BASE_URL/api/v1/kyb/requests" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: onboarding-emp-123" \
  -d '{
    "external_ref": "emp-123",
    "form_id": "'"$FORM_ID"'",
    "webhook_endpoint_id": "'"$WEBHOOK_ENDPOINT_ID"'",
    "return_url": "https://tu-app.com/kyb/listo"
  }'
```

### 4.2 Listar solicitudes — `GET /requests`

Query params: `status`, `external_ref`, `limit` (def 20, máx 100), `offset` (def 0).

**Respuesta `200`:**

```json
{
  "data": [
    { "id": "…", "externalRef": "emp-123", "status": "under_review",
      "decision": null, "createdAt": "…", "submittedAt": "…", "decidedAt": null }
  ],
  "limit": 20, "offset": 0, "total": 42
}
```

### 4.3 Estado + resultado — `GET /requests/:id`

**Respuesta `200`:**

```json
{
  "id": "…", "externalRef": "emp-123",
  "status": "under_review", "decision": null,
  "createdAt": "…", "submittedAt": "…", "decidedAt": null,
  "aml": [
    { "provider": "didit", "status": "passed",
      "result": { /* respuesta cruda de DIDIT */ },
      "created_at": "…", "updated_at": "…" }
  ]
}
```

`404 { "error": "not_found" }` si la solicitud no existe o no es tuya.

### 4.4 Respuestas del formulario — `GET /requests/:id/answers`

Query: `?locale=es|en` (default: idioma del formulario). Los campos de archivo/selfie
incluyen **URLs firmadas temporales**.

```json
{
  "id": "…", "externalRef": "emp-123", "status": "under_review",
  "answers": [
    { "key": "legal_name", "label": "Razón social", "type": "short_text",
      "value": "ACME S.A.", "raw": "ACME S.A." },
    { "key": "id_front", "label": "Documento (frente)", "type": "file",
      "value": "ine_frente.jpg",
      "files": [{ "filename": "ine_frente.jpg", "url": "https://…firmada…" }] }
  ]
}
```

### 4.5 Documentos — `GET /requests/:id/documents`

Query: `?expires_in=<segundos>` (60–86400, default 3600).

```json
{
  "documents": [
    { "doc_type": "general", "filename": "acta.pdf", "mime": "application/pdf",
      "size": 182734, "uploaded_at": "…", "url": "https://…firmada…" }
  ]
}
```

Las `url` son firmadas y **caducan**; genera una consulta nueva cuando las necesites.

### 4.6 Avance del borrador — `GET /requests/:id/draft`

Cuánto lleva lleno el usuario, sin esperar a que envíe:

```json
{
  "id": "…", "externalRef": "emp-123", "status": "in_progress",
  "total": 12, "filled": 7, "percent": 58,
  "fields": [ { "key": "legal_name", "label": "Razón social", "filled": true, "required": true } ]
}
```

### 4.7 Re-emitir link — `POST /requests/:id/invitation`

Genera un `invitationUrl` nuevo **conservando el borrador** (si tu usuario perdió el
link o expiró). Body opcional: `{ "ttl_hours": 168 }`.

```json
{ "invitationUrl": "https://…/f/<nuevo-token>", "token": "…", "expiresAt": "…" }
```

`409` si la solicitud ya fue enviada o cerrada.

---

## 5. Flujo del usuario final y reanudación

- Redirige a tu usuario al `invitationUrl`. Llena el formulario (documentos, selfie, etc.).
- **Autosave**: si se sale a la mitad y vuelve al **mismo `invitationUrl`** (mientras esté `created`/`in_progress`), **se restauran sus datos**. Guarda el `invitationUrl` de tu lado.
- Si el link se pierde o expira, usa `POST /:id/invitation` para uno nuevo (mismo borrador).
- Si pasaste `return_url`, al enviar el formulario el usuario es redirigido de vuelta a tu app.

---

## 6. Webhooks (recomendado sobre polling)

### Registro
Nos das tu URL de webhook y la **registramos** (solo `https`, puerto 443; rechazamos
IPs privadas/loopback). Te entregamos el `WEBHOOK_ENDPOINT_ID` (para el `POST /requests`)
y el `WEBHOOK_SECRET` (una sola vez).

### Eventos
Hacemos `POST` a tu endpoint cuando:
- `verification.completed` — terminaron las verificaciones (estado `under_review`).
- `decision.made` — se aprobó/rechazó la solicitud.

### Request que recibes
Cabeceras:
```
x-kyb-event: verification.completed
x-kyb-event-id: evt_…
x-kyb-delivery-id: dlv_…
x-kyb-timestamp: 1784300100
x-kyb-signature: v1=<hex>
```
Body (JSON): el mismo shape que `GET /:id` + `event`, `event_id`, `sent_at`.

### Verificación de la firma (obligatoria)
`<hex> = HMAC-SHA256(WEBHOOK_SECRET, `x-kyb-timestamp` + "." + <body-crudo>)`

Tu receptor **debe**:
1. Recomputar la firma sobre el **body crudo** y comparar en **tiempo constante**.
2. **Rechazar** si `x-kyb-timestamp` tiene más de ~5 minutos (anti-replay).
3. **Deduplicar** por `event_id` (podemos reintentar hasta 3 veces).
4. Procesar de forma **idempotente** y responder `2xx` rápido.

**Ejemplo (Node.js / Express):**

```js
import crypto from "crypto";

app.post("/kyb-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const raw = req.body;                       // Buffer crudo, sin parsear
  const ts = req.get("x-kyb-timestamp");
  const sig = (req.get("x-kyb-signature") || "").replace(/^v1=/, "");

  // 1) anti-replay
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return res.status(400).send("stale");
  }
  // 2) firma en tiempo constante
  const expected = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(`${ts}.${raw.toString("utf8")}`)
    .digest("hex");
  const ok =
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return res.status(401).send("bad signature");

  const event = JSON.parse(raw.toString("utf8"));
  // 3) dedupe por event.event_id  4) procesar idempotente
  res.sendStatus(200);
});
```

> El polling de `GET /:id` sirve de respaldo por si una entrega falla.

---

## 7. Rate limiting

Límite por API key. Al exceder:
```
429 { "error": "rate_limited" }
Retry-After: 60
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
```
Respeta el `Retry-After`. Endpoints de escritura/costosos (crear, re-emitir,
documentos) son más estrictos.

---

## 8. Enumeraciones

- **`status`**: `created` → `in_progress` → `submitted` → `under_review` → `approved` | `rejected` | `expired`.
- **`decision`**: `approved` | `rejected` | `null`.
- **AML `status`** (por check): `pending` | `passed` | `flagged` | `error`.

---

## 9. Errores

| HTTP | `error` | Cuándo |
|---|---|---|
| 400 | `invalid_json` | Body no es JSON |
| 401 | `unauthorized` | Falta/invalida la API key |
| 404 | `not_found` | La solicitud no existe o no es tuya |
| 409 | `idempotency_key_reuse` / `request_in_progress` | Misma Idempotency-Key con body distinto / en curso |
| 409 | (re-emitir) | La solicitud ya fue enviada o cerrada |
| 422 | `invalid_body` / `invalid_return_url` / `invalid_webhook_endpoint` | Validación del body |
| 429 | `rate_limited` | Cuota excedida |

---

## 10. Checklist de configuración de tu lado

- [ ] Guardar `API_KEY` como secreto server-side (nunca en frontend).
- [ ] Guardar `FORM_ID`, `WEBHOOK_ENDPOINT_ID`.
- [ ] Guardar `WEBHOOK_SECRET` (verificación de firma).
- [ ] Implementar el receptor de webhook con verificación de firma, anti-replay y dedupe.
- [ ] Persistir el `invitationUrl` (para reanudación) y el `id` (para consultas).
- [ ] Definir tu `external_ref` y (opcional) tu `return_url` https.
- [ ] Manejar `429` con `Retry-After` y usar `Idempotency-Key` en la creación.

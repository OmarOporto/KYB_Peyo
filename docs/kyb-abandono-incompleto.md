# KYB incompleto: cómo detectarlo y qué hacer

Guía de implementación para la aplicación cliente. Complementa
[`integracion-api-kyb.md`](./integracion-api-kyb.md), que es la referencia completa
de la API; acá solo está el caso "el usuario abrió el formulario y no lo terminó".

---

## 1. Lo primero: no hay evento de abandono

Conviene decirlo antes que nada para que nadie lo espere:

> **No emitimos ningún webhook cuando un usuario abandona.** Los eventos existentes
> (`request.submitted`, `verification.completed`, `decision.made`, `changes.requested`,
> `request.expiring`, `request.expired`) no incluyen "quedó a medias".

Nosotros **sí** sabemos que quedó incompleto, y sabemos exactamente en qué campo se
quedó, desde el primer autoguardado. Pero esa información **solo sale si la piden**.

Lo único que llega solo está atado al vencimiento del link, y el calendario por
defecto es lento:

| Día | Qué pasa |
|---|---|
| 0 | Se crea la solicitud. TTL por defecto: **14 días** |
| 1 | El usuario llena la mitad y se va. Nosotros ya lo sabemos. **Ustedes no.** |
| 11 | Llega `request.expiring` (≈3 días antes de vencer) |
| 14 | Vence. Llega `request.expired` |

Si el producto necesita reaccionar antes del día 11 —mandar un recordatorio, marcar el
onboarding como estancado— **hay que consultarlo activamente**. Esta guía explica cómo.

> El barrido que dispara `expiring`/`expired` corre **una vez al día**, así que ambos
> eventos llegan con hasta ~24 h de resolución. El acceso del usuario al link, en
> cambio, se corta en tiempo real en el instante del vencimiento.

---

## 2. Los tres estados que importan

De los ocho estados posibles, para este caso solo hay que mirar tres:

| Estado | Qué significa | Acción típica |
|---|---|---|
| `created` | Le mandamos el link y **nunca lo abrió** (o lo abrió sin escribir nada) | Reenviar el link / recordatorio de arranque |
| `in_progress` | **Empezó y lo dejó a medias.** Hay borrador guardado | Recordatorio con el link original; el borrador se restaura solo |
| `expired` | El link venció sin que terminara | `POST /:id/invitation` para revivirlo sin perder lo escrito |

La transición `created → in_progress` ocurre en el **primer autoguardado**. Es la
señal más limpia para distinguir "no arrancó" de "arrancó y se trabó" — dos problemas
distintos que suelen querer mensajes distintos.

Los demás estados (`submitted`, `under_review`, `changes_requested`, `approved`,
`rejected`) ya no son abandono y se manejan por webhook como siempre.

---

## 3. Qué guardar al crear la solicitud

Esto es responsabilidad de la app cliente y condiciona todo lo demás:

```js
const res = await fetch(`${KYB_BASE_URL}/api/v1/kyb/requests`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${KYB_API_KEY}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `kyb-${userId}-${intentId}`,
  },
  body: JSON.stringify({
    external_ref: userId,
    form_id: KYB_FORM_ID,                       // ver nota al final
    webhook_endpoint_id: KYB_WEBHOOK_ENDPOINT_ID,
  }),
});
// → 201 { id, invitationUrl, token, expiresAt, status: "created" }
```

Guardar **los tres**:

- **`id`** — para todas las consultas posteriores.
- **`invitationUrl`** — el mismo link restaura el borrador mientras la solicitud esté
  `created` o `in_progress`. Es el link a reenviar en un recordatorio; no hace falta
  pedir uno nuevo salvo que haya expirado.
- **`expiresAt`** — permite calcular el recordatorio sin depender de nuestro webhook.

---

## 4. Detectar el abandono

### 4.1 Barrido periódico (la vía principal)

Listar las solicitudes que quedaron esperando:

```
GET /api/v1/kyb/requests?status=in_progress&limit=100
Authorization: Bearer <API_KEY>
```

```json
{
  "data": [
    { "id": "…", "externalRef": "user-123", "status": "in_progress",
      "decision": null, "createdAt": "…", "submittedAt": null, "decidedAt": null }
  ],
  "limit": 100, "offset": 0, "total": 37
}
```

Repetir con `status=created` para los que nunca abrieron. Soporta `offset` para paginar.

> La lista **no** trae `expiresAt`. Si hace falta el vencimiento, sale de
> `GET /requests/:id` o del `expiresAt` que ya guardaron al crear.

**Cadencia sugerida:** una vez por hora. El límite es de **60 req/min por key** (al
excederlo: `429` con `Retry-After`), así que un barrido horario paginado no lo roza.

### 4.2 Avance exacto — el endpoint clave

Para saber *cuánto* le falta y *qué* le falta:

```
GET /api/v1/kyb/requests/:id/draft
```

```json
{
  "id": "…", "externalRef": "user-123", "status": "in_progress",
  "total": 12, "filled": 7, "percent": 58,
  "fields": [
    { "key": "legal_name", "label": "Razón social", "filled": true,  "required": true },
    { "key": "id_front",   "label": "Documento (frente)", "filled": false, "required": true }
  ]
}
```

Tres propiedades a tener en cuenta al implementar:

1. **`total` cuenta solo lo que la lógica realmente le va a pedir a ese usuario.** Los
   campos ocultos por condición y las ramas que no tomó no entran. Es el mismo conjunto
   que validamos al enviar, así que **`percent: 100` significa que ya puede enviar**.
2. **`total` puede cambiar** mientras el usuario avanza y elige una rama u otra. No lo
   traten como constante entre dos consultas.
3. **`required: false` y `filled: false` no es un bloqueo.** Para decidir si vale la pena
   molestar al usuario, contar solo los `required: true && filled: false`.

Con eso se puede escribir un recordatorio útil de verdad: *"te faltan 2 documentos"* en
lugar de *"completá tu verificación"*.

---

## 5. Reaccionar

### 5.1 Recordatorio con el link original

Mientras esté `created` o `in_progress`, **el `invitationUrl` guardado sigue sirviendo** y
restaura el borrador. No hay que pedir nada; solo reenviarlo.

### 5.2 Link nuevo (perdido o vencido)

```
POST /api/v1/kyb/requests/:id/invitation
Content-Type: application/json

{ "ttl_hours": 168 }        // opcional, default 14 días
```

```json
{ "invitationUrl": "https://…/f/<nuevo-token>", "token": "…", "expiresAt": "…" }
```

**Conserva el borrador completo.** Aplica a `created`, `in_progress`, `expired` y
`changes_requested`. Desde `expired` revive la solicitud: vuelve a `in_progress` si había
borrador, o a `created` si estaba vacía.

Devuelve `409` si la solicitud ya fue enviada o cerrada.

### 5.3 Los dos webhooks de vencimiento

Si están suscritos (requiere `webhook_endpoint_id` al crear la solicitud):

- **`request.expiring`** — ≈3 días antes de vencer, **una sola vez por ciclo de link**. El
  marcador se reinicia al re-emitir el link, así que un link nuevo vuelve a avisar. El
  body trae `expires_at`. Es el mejor momento para el "último aviso".
- **`request.expired`** — ya venció, estado `expired`. Momento de cerrar el onboarding del
  lado de ustedes o de ofrecer empezar de nuevo con `POST /:id/invitation`.

> **Sin `KYB_WEBHOOK_ENDPOINT_ID` configurado no llega ninguno de los dos.** Queda todo
> por polling. Verifiquen que la variable esté cargada antes de asumir que los eventos
> van a aparecer.

Ambos llevan la firma HMAC habitual y **exigen** verificación y deduplicación por
`event_id` — la entrega es *at-least-once*. La receta completa está en
[`integracion-api-kyb.md` §6](./integracion-api-kyb.md).

---

## 6. Checklist de implementación

- [ ] Persistir `id`, `invitationUrl` y `expiresAt` al crear cada solicitud.
- [ ] Barrido horario de `?status=in_progress` y `?status=created`, paginado.
- [ ] Para cada una, `GET /:id/draft` y contar los `required && !filled`.
- [ ] Definir la política de recordatorios (p. ej. a las 24 h, a los 7 días, y en
      `request.expiring`), reusando el `invitationUrl` guardado.
- [ ] Distinguir el mensaje de `created` ("no arrancaste") del de `in_progress`
      ("te faltan N cosas") — son problemas distintos.
- [ ] Manejar `request.expiring` y `request.expired` con firma verificada y dedupe por
      `event_id`.
- [ ] Al reactivar desde `expired`, usar `POST /:id/invitation` y **reemplazar** el
      `invitationUrl` guardado.
- [ ] Respetar el `429`: respaldarse en `Retry-After`, no reintentar en caliente.

---

## 7. Dos cosas a acordar entre ambos equipos

**`KYB_FORM_ID` conviene mandarlo siempre.** Es opcional en la API, pero si se omite la
solicitud **no** cae al formulario asignado a esa key: cae al último formulario publicado
del sistema, que puede ser de otro cliente. Mandarlo explícito en cada `POST /requests`.

**La ventana de `request.expiring` es hoy fija en 3 días.** Si para el producto es tarde,
podemos hacerla configurable por key, o agregar un evento nuevo tipo `request.stalled` que
se dispare tras N horas sin actividad — que es el que realmente responde a "lo dejó a
medias" sin obligar a hacer polling. Ninguna de las dos existe todavía; si les sirve,
pídanlo y lo agendamos.

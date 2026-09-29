/**
 * Qué formulario usa una solicitud nueva.
 *
 * Antes: el `form_id` pedido sin ningún chequeo (de cualquier cliente, incluso
 * en borrador) o, sin `form_id`, el último publicado de TODO el sistema. Con
 * organizaciones eso es una fuga: la solicitud de un cliente podía terminar
 * llenando el formulario de otro.
 *
 * Ahora, en orden:
 *  1. El `form_id` pedido, solo si es de la misma org y está publicado.
 *  2. Sin `form_id`: el formulario por defecto de la key (`KYB_FORM_ID` del
 *     panel), si sigue publicado.
 *  3. Si no: el último publicado de la org.
 *
 * Puro (sin `@/` ni `server-only`) para probarlo con `node --test`; la lectura
 * de los candidatos la hace `lib/kyb/service.ts`.
 */

export interface FormCandidate {
  id: string;
  org_id: string;
  status: string;
  version: number | null;
}

export type FormChoice =
  | { ok: true; formId: string; revision: number | null }
  | { ok: false; error: "invalid_form" | "no_published_form" };

function usable(form: FormCandidate | null | undefined, orgId: string): form is FormCandidate {
  return !!form && form.org_id === orgId && form.status === "published";
}

export function pickRequestForm(input: {
  orgId: string;
  /** `form_id` que pidió el llamador (la API), si pidió uno. */
  requestedId?: string | null;
  /** La fila de `requestedId`, o null si no existe. */
  requested?: FormCandidate | null;
  /** La fila del formulario por defecto de la key, si tiene. */
  keyDefault?: FormCandidate | null;
  /** El último publicado de la org. */
  latestPublished?: FormCandidate | null;
}): FormChoice {
  const { orgId } = input;

  // Pedir uno explícito y que no sirva es un error del cliente, no un motivo
  // para caer en silencio a otro formulario.
  if (input.requestedId) {
    return usable(input.requested, orgId) && input.requested.id === input.requestedId
      ? { ok: true, formId: input.requested.id, revision: input.requested.version }
      : { ok: false, error: "invalid_form" };
  }

  for (const form of [input.keyDefault, input.latestPublished]) {
    if (usable(form, orgId)) return { ok: true, formId: form.id, revision: form.version };
  }
  return { ok: false, error: "no_published_form" };
}

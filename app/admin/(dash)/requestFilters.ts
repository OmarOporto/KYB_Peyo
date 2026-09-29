// Compartido por la página (server) y la barra de filtros (client). No puede
// vivir en RequestsToolbar.tsx: lo que exporta un módulo "use client" llega al
// server como referencia de cliente, no como el string.

/** Valor del filtro de formulario para las solicitudes sin `form_id`. */
export const FORM_NONE = "none";

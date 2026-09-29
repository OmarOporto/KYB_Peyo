// Compartido por el layout (server, lee la cookie) y el Sidebar (client, la
// escribe). No puede vivir en Sidebar.tsx: lo que exporta un módulo
// "use client" llega al server como referencia de cliente, no como el string.

/** Cookie con el estado del sidebar de escritorio: `collapsed` | `expanded`. */
export const SIDEBAR_COOKIE = "kyb_sidebar";

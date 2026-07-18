-- Redirect del navegador del usuario final tras enviar el formulario.
-- Distinto de `callback_url` (webhook server-to-server): esto es a dónde se
-- envía de vuelta al usuario en su navegador cuando termina.
alter table public.kyb_requests
  add column if not exists return_url text;

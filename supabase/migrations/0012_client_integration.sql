-- Datos para la vista de "Configuración de integración" por cliente.
alter table public.api_keys
  -- Prefijo NO-secreto para identificar la key en el panel (p. ej. "kyb_ab12cd").
  add column if not exists key_prefix      text,
  -- Formulario asignado al cliente (el KYB_FORM_ID a entregar).
  add column if not exists default_form_id uuid references public.forms(id);

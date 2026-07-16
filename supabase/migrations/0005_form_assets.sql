-- =============================================================
-- Storage: bucket PÚBLICO para assets de formulario (imágenes de ayuda
-- en preguntas/opciones). Público => se sirven por URL sin firmar.
-- La escritura ocurre solo vía service-role en el server action.
-- =============================================================
insert into storage.buckets (id, name, public)
values ('form-assets', 'form-assets', true)
on conflict (id) do nothing;

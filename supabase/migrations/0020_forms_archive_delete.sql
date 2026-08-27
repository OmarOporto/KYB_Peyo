-- =============================================================
-- Archivar y eliminar formularios
-- -------------------------------------------------------------
-- Hasta ahora un formulario no se podía sacar del panel: el borrado existía en
-- la app pero fallaba con 23503 en cuanto el formulario estaba referenciado,
-- porque las dos FKs a `forms` se crearon sin cláusula `on delete` (NO ACTION).
--
-- Esta migración fija la política por referencia, que no es la misma en los dos
-- casos:
--
--   kyb_requests.form_id      -> SET NULL. La solicitud guarda su propio snapshot
--                                de la definición (`form_definition`, ver 0007) y
--                                `resolveRequestDefinition` lo prefiere sobre el
--                                id, así que desvincular no le quita nada. El
--                                caso en que SÍ le quitaría algo (solicitud sin
--                                snapshot) lo bloquea la app antes de borrar,
--                                porque el fallback silencioso de
--                                `getFormForRequest` es al último formulario
--                                publicado — con otras keys.
--
--   api_keys.default_form_id  -> RESTRICT. Es el KYB_FORM_ID que el cliente tiene
--                                configurado: nulificarlo rompe su integración
--                                sin aviso. Explícito para que el borrado falle
--                                en la DB aunque el chequeo de la app se saltee.
--
-- Además se agrega el estado `archived`, que es la salida reversible y de todos
-- los días: saca el formulario de la lista sin destruir nada.
-- =============================================================

-- ------------------------------------------------------------
-- Estado `archived`
-- ------------------------------------------------------------
-- El CHECK inline de 0004 se auto-nombra <tabla>_<columna>_check por convención
-- Postgres (mismo criterio que 0014).
alter table public.forms
  drop constraint if exists forms_status_check;
alter table public.forms
  add constraint forms_status_check
  check (status in ('draft', 'published', 'archived'));

comment on column public.forms.status is
  'draft | published | archived. Solo published es visible en /forms/[id] y elegible como formulario por defecto (ver lib/forms/store.ts).';

-- ------------------------------------------------------------
-- FKs a forms
-- ------------------------------------------------------------
-- Se buscan por columna y no por nombre: un `drop constraint if exists` con el
-- nombre equivocado no falla, y el `add` posterior crearía una FK duplicada
-- (Postgres las permite) dejando la vieja restrictiva en pie. El borrado
-- seguiría fallando y la migración habría "pasado" — falla silenciosa.
-- Cada una de estas dos tablas tiene exactamente una FK a `forms`, así que
-- basta con buscar por (tabla que referencia, tabla referenciada).
do $$
declare
  c record;
begin
  for c in
    select con.conrelid::regclass::text as tbl, con.conname as cname
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid = 'public.forms'::regclass
      and con.conrelid in ('public.kyb_requests'::regclass, 'public.api_keys'::regclass)
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.cname);
  end loop;
end $$;

alter table public.kyb_requests
  add constraint kyb_requests_form_id_fkey
  foreign key (form_id) references public.forms(id) on delete set null;

alter table public.api_keys
  add constraint api_keys_default_form_id_fkey
  foreign key (default_form_id) references public.forms(id) on delete restrict;

-- Sin este índice, tanto el SET NULL del borrado como el conteo previo de
-- solicitudes afectadas hacen seq scan sobre kyb_requests.
create index if not exists kyb_requests_form_idx
  on public.kyb_requests(form_id);

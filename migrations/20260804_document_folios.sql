-- Folios reales para documentos comerciales (cotizaciones, propuestas, etc.).
-- Antes: `folio('COT')` en pdf/doc.tsx generaba `COT-YYYYMMDD-XXXX` con random
-- entre 1000-9999. Era puramente cosmético, no rastreable, colisionaba bajo volumen.
--
-- Ahora: secuencia atómica por (portal_email, prefix). UPSERT + RETURNING garantiza
-- concurrencia sin locks explícitos. `ops_documents.folio` persiste el folio asignado
-- para que `buscar_documento_oficina` pueda filtrar por él.
--
-- Formato del folio: `{PREFIX}-{NNNNNN}` (6 dígitos zero-padded).
-- Ejemplo: `COT-000042`, `PROP-000007`.

create table if not exists document_folios (
  portal_email text not null,
  prefix       text not null,
  next_number  integer not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (portal_email, prefix)
);

alter table ops_documents add column if not exists folio text;
create index if not exists ops_documents_folio_idx on ops_documents (folio);

-- RPC atómico: UPSERT + RETURNING para obtener el siguiente número sin race conditions.
-- Retorna el número asignado (el que debe usarse ahora), no el próximo.
create or replace function next_folio(
  p_portal_email text,
  p_prefix       text
) returns integer
language plpgsql
security definer
as $$
declare
  result integer;
begin
  insert into document_folios (portal_email, prefix, next_number, updated_at)
  values (p_portal_email, p_prefix, 2, now())
  on conflict (portal_email, prefix)
  do update
    set next_number = document_folios.next_number + 1,
        updated_at  = now()
  returning next_number - 1 into result;
  return result;
end;
$$;

notify pgrst, 'reload schema';

-- migrations/20260812_invoicing_factura_requests_columns.sql
alter table factura_requests add column if not exists uuid text;
alter table factura_requests add column if not exists sello_sat text;
alter table factura_requests add column if not exists certificado_sat text;
alter table factura_requests add column if not exists fecha_timbrado timestamptz;
alter table factura_requests add column if not exists cadena_original text;
alter table factura_requests add column if not exists xml_storage_path text;
alter table factura_requests add column if not exists pdf_storage_path text;
alter table factura_requests add column if not exists qr_storage_path text;
alter table factura_requests add column if not exists stamp_attempts int default 0;
alter table factura_requests add column if not exists stamp_last_error text;
alter table factura_requests add column if not exists stamp_last_error_at timestamptz;
alter table factura_requests add column if not exists provider text;
alter table factura_requests add column if not exists guardrail_reason text;

-- status ya existe; solo documentamos estados nuevos
comment on column factura_requests.status is
  'pending | stamping | stamped | stamp_failed | marked_manual | cancellation_requested | cancelled';

create unique index if not exists factura_requests_uuid_unique
  on factura_requests (uuid) where uuid is not null;
create index if not exists factura_requests_stamping_status
  on factura_requests (status) where status in ('stamping','stamp_failed','cancellation_requested');

-- migrations/20260812_invoicing_cfdi_cancellations_table.sql
create table if not exists cfdi_cancellations (
  id uuid primary key default gen_random_uuid(),
  factura_request_id uuid references factura_requests(id) on delete restrict,
  organization_email text not null,
  uuid_cancelado text not null,
  motivo text not null check (motivo in ('01','02','03','04')),
  uuid_sustituto text,
  requested_by text,
  requested_by_agent_id uuid,
  requested_via text check (requested_via in ('voice','chat','email','portal')),
  status text not null default 'requested'
    check (status in ('requested','sent_to_sat','accepted','rejected','expired')),
  sat_status_last_check timestamptz,
  sat_acuse_xml_path text,
  razon_cliente text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sustituto_requerido check (motivo != '01' or uuid_sustituto is not null)
);

create index if not exists cfdi_cancellations_org_status
  on cfdi_cancellations (organization_email, status);
create index if not exists cfdi_cancellations_poll
  on cfdi_cancellations (status, sat_status_last_check)
  where status = 'sent_to_sat';

create or replace function set_cfdi_cancellations_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_cfdi_cancellations_updated on cfdi_cancellations;
create trigger trg_cfdi_cancellations_updated before update on cfdi_cancellations
for each row execute function set_cfdi_cancellations_updated_at();

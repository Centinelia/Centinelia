-- migrations/20260812_invoicing_organizations_columns.sql
alter table organizations add column if not exists invoicing_provider text;
alter table organizations add column if not exists invoicing_credentials_encrypted text;
alter table organizations add column if not exists invoicing_csd_cer_path text;
alter table organizations add column if not exists invoicing_csd_key_path text;
alter table organizations add column if not exists invoicing_csd_password_encrypted text;
alter table organizations add column if not exists invoicing_csd_version int default 0;
alter table organizations add column if not exists invoicing_csd_expires_at timestamptz;
alter table organizations add column if not exists invoicing_csd_no_certificado text;
alter table organizations add column if not exists invoicing_rfc_emisor text;
alter table organizations add column if not exists invoicing_razon_social text;
alter table organizations add column if not exists invoicing_regimen_fiscal text;
alter table organizations add column if not exists invoicing_lugar_expedicion text;
alter table organizations add column if not exists invoicing_test_mode boolean default true;
alter table organizations add column if not exists invoicing_allow_agent_cancellation boolean default false;
alter table organizations add column if not exists invoicing_limits jsonb default '{
  "monto_max_mxn": 50000,
  "blocked_uso_cfdi": ["D01","D02","D03","D04","D05","D06","D07","D08","D09","D10"],
  "max_stamps_per_day": 50,
  "max_stamps_per_hour_per_rfc": 3
}'::jsonb;

comment on column organizations.invoicing_provider is 'null = escalar humano (default). solucion_factible = timbrar auto';

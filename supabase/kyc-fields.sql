-- kyc-fields: datos de verificación de identidad a nivel cuenta.
-- Aplica sobre organizations. Correr después de account-status.sql.
-- Run en Supabase SQL Editor.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS rfc              text,
  ADD COLUMN IF NOT EXISTS curp             text,
  ADD COLUMN IF NOT EXISTS legal_name       text,
  ADD COLUMN IF NOT EXISTS aup_accepted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS kyc_completed_at timestamptz;

-- Index para búsqueda por RFC (uso administrativo)
CREATE UNIQUE INDEX IF NOT EXISTS organizations_rfc_idx ON organizations(rfc) WHERE rfc IS NOT NULL;

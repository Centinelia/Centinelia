-- supabase/migrations/20260804_sheets_mappings.sql

CREATE TABLE sheets_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'clientes','leads','bitacoras','oc','cajas_chicas','custom'
  )),
  custom_purpose_label TEXT,
  spreadsheet_id TEXT NOT NULL,
  tab_name TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  headers_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (purpose = 'custom' AND custom_purpose_label IS NOT NULL)
    OR (purpose != 'custom' AND custom_purpose_label IS NULL)
  )
);

CREATE UNIQUE INDEX sheets_mappings_pe_purpose_reserved
  ON sheets_mappings (portal_email, purpose)
  WHERE purpose != 'custom';

CREATE UNIQUE INDEX sheets_mappings_pe_custom_label
  ON sheets_mappings (portal_email, custom_purpose_label)
  WHERE purpose = 'custom';

CREATE INDEX sheets_mappings_portal_email ON sheets_mappings (portal_email);

ALTER TABLE voice_agents
  ADD COLUMN sync_leads_to_sheets BOOLEAN NOT NULL DEFAULT false;

-- updated_at trigger si existe patrón; si no, saltar (Centinelia usa updated_at manual en algunas tablas)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sheets_mappings_updated_at ON sheets_mappings;
CREATE TRIGGER sheets_mappings_updated_at
  BEFORE UPDATE ON sheets_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

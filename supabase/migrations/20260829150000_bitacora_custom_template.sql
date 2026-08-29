-- 2026-08-29: Custom bitácora template (Fase 4).
-- Cliente sube su .xlsx tal cual, Claude lo analiza y devuelve mapping.
-- El cron/export usa el custom template si existe, sino cae al default.

-- RLS pattern del proyecto: enable sin policies, todo el acceso vía service_role.
ALTER TABLE public.client_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_weekly_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS bitacora_template JSONB;

COMMENT ON COLUMN organizations.bitacora_template IS
  'Custom bitacora template subido por el cliente y analizado por AI. NULL = usar default Centinelia. Fields: url (storage path), mapping (col letter → IncidentRow field name), insertion_row (1-indexed), uploaded_at, uploaded_by.';

-- Bucket privado para las plantillas
INSERT INTO storage.buckets (id, name, public)
VALUES ('bitacora-templates', 'bitacora-templates', false)
ON CONFLICT (id) DO NOTHING;

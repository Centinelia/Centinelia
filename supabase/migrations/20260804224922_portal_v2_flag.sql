-- Feature flag: enable portal V2 IA (Escritorio/Bandeja/Historial/Tu equipo/Administración)
-- Opt-in per organization. Default false.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS portal_v2_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.portal_v2_enabled IS
  'Cuando true, el portal renderiza el sidebar V2 con 5 áreas y header "Tu oficina digital". Fase 1 del rediseño IA.';

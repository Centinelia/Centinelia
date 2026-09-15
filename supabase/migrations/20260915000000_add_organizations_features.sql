-- Add org-level feature flags container for Navi (social_publishing) and
-- future org-scoped features. Semantically distinct from voice_agents.features
-- which is per-agent config (smtp_config, tortilleria_mapping, etc).
--
-- Additive migration: no data change, no breaking. Task 4's requireSocialFeature()
-- ha estado queryeando esta columna desde ship pero siempre obtenía null (false
-- negative silencioso). Ver progress.md Round 9 BUG-SCHEMA-FEATURES-ORG.
--
-- Aplicar en Supabase Studio SQL Editor O via:
--   npx supabase db push  (si tienes CLI configurada)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN organizations.features IS
  'Org-level feature flags. Keys: social_publishing {enabled, agency_mode}. Distinto de voice_agents.features (per-agent config).';

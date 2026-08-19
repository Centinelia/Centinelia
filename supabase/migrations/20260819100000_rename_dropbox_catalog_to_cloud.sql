-- Rename pack dropbox_catalog → cloud_catalog:
-- - organizations.dropbox_catalog_config → catalog_config (con provider dentro del JSONB)
-- - organizations.features.dropbox_catalog → features.cloud_catalog (bool)
--
-- Backfill: config vieja no tenía provider — asumimos 'dropbox' (único que
-- existía antes del refactor).

-- 1. Nueva columna catalog_config JSONB
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS catalog_config jsonb;

-- 2. Backfill desde columna vieja + agrega provider='dropbox' al JSONB
UPDATE organizations
   SET catalog_config = COALESCE(dropbox_catalog_config, '{}'::jsonb) || jsonb_build_object('provider', 'dropbox')
 WHERE dropbox_catalog_config IS NOT NULL
   AND catalog_config IS NULL;

-- 3. Rename feature flag dentro de voice_agents.features (features vive en voice_agents, no organizations)
UPDATE voice_agents
   SET features = (features - 'dropbox_catalog') || jsonb_build_object('cloud_catalog', features->'dropbox_catalog')
 WHERE features ? 'dropbox_catalog';

-- 4. Drop columna vieja (data ya migrada). Comment antes de drop por rollback rápido.
COMMENT ON COLUMN organizations.dropbox_catalog_config IS
  'DEPRECATED 2026-08-19. Renombrada a catalog_config con provider dentro del JSONB. Drop en migración futura.';

ALTER TABLE organizations
  DROP COLUMN IF EXISTS dropbox_catalog_config;

COMMENT ON COLUMN organizations.catalog_config IS
  'Config del pack cloud_catalog. Shape: { provider: dropbox|google|microsoft, doc_path, sku_column, desc_column, price_column? }. NULL cuando el pack no está configurado.';

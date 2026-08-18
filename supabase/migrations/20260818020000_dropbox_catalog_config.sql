-- Dropbox catalog pack: config JSONB por org donde vive el path del doc en
-- Dropbox del cliente + qué columnas mapear a SKU / descripción / precio.
-- Feature activation vive en organizations.features.dropbox_catalog (bool).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dropbox_catalog_config jsonb;

COMMENT ON COLUMN organizations.dropbox_catalog_config IS
  'Config del pack dropbox_catalog. Shape: { doc_path, sku_column, desc_column, price_column? }. NULL cuando el pack no está configurado.';

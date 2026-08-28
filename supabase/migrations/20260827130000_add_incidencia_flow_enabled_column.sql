-- Migration: 20260827130000_add_incidencia_flow_enabled_column.sql
-- Adds org-level boolean flag para activar el flow de incidencias.
-- Patrón consistente con `ops_ledger_enabled`, `instant_processing_enabled`,
-- `invoicing_test_mode`, etc. Reemplaza el diseño original que asumía
-- `organizations.features` JSONB (columna que nunca existió).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS incidencia_flow_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.incidencia_flow_enabled IS
  'Activa el flow de incidencias tortillería para esta org. Cuando true: expone las tools registrar_incidencia + verificar_recepcion_incidencia a los meerkats vía pack `incidencia_flow`, y habilita la vista /portal/[token]/oficina/bitacora.';

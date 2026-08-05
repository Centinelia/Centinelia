-- Escala del sistema de aprendizajes conversacionales:
-- 1. Estado 'archived' para retirar sin borrar
-- 2. Columna applies_to_meerkat para filtrar inyección por meerkat (NULL = global)
-- 3. Índices para queries filtradas + auto-mantenimiento

ALTER TABLE conversational_learnings
  DROP CONSTRAINT IF EXISTS conversational_learnings_status_check;

ALTER TABLE conversational_learnings
  ADD CONSTRAINT conversational_learnings_status_check
  CHECK (status IN ('pending', 'approved', 'active', 'rejected', 'archived'));

ALTER TABLE conversational_learnings
  ADD COLUMN IF NOT EXISTS applies_to_meerkat text NULL;

-- Índice para fetch por scope al inyectar prompts
CREATE INDEX IF NOT EXISTS conversational_learnings_active_scope_idx
  ON conversational_learnings(status, applies_to_meerkat)
  WHERE status = 'active';

-- Índice para el auto-archivo por edad + uso
CREATE INDEX IF NOT EXISTS conversational_learnings_maintenance_idx
  ON conversational_learnings(status, approved_at, source_count)
  WHERE status = 'active';

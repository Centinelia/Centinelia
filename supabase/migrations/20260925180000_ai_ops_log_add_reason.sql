-- Agrega columna `reason` a ai_ops_log como campo dedicado y auditado.
--
-- Motivacion (Fase 7 I-1): el campo `source` en ai_ops_log contenia
-- indistintamente: el tipo de operacion ('rule_setup', 'task_execution_start')
-- y el subsistema caller ('heartbeat', 'agent_chat'). El campo `reason` es
-- exclusivamente el tipo semantico de la operacion, alineado con el mapa
-- LEDGER_REASONS de ledger-schemas.ts.
--
-- backwards-compat: `source` se mantiene y sigue siendo llenado (el
-- drift detector en consumption-audit.ts lo usa). `reason` se agrega como
-- columna nueva; puede ser NULL en filas historicas anteriores a este deploy.
--
-- Indice compuesto (portal_email, reason) para queries de auditoria
-- cross-org por tipo de operacion.
--
-- Nomenclatura: 20260925180000 > 20260925170000 (fichas_metadata).
-- Ver Fase 7 spec Seccion 8.1 y feedback_pool_transparencia.

ALTER TABLE ai_ops_log
  ADD COLUMN IF NOT EXISTS reason text;

-- El indice existente en `source` se mantiene. Agregamos uno en `reason`
-- para queries por tipo de operacion (ej: todos los rule_setup de la semana).
CREATE INDEX IF NOT EXISTS ai_ops_log_reason_idx
  ON ai_ops_log (reason)
  WHERE reason IS NOT NULL;

-- Indice compuesto para queries de auditoria por org + tipo de operacion.
CREATE INDEX IF NOT EXISTS ai_ops_log_portal_reason_idx
  ON ai_ops_log (portal_email, reason)
  WHERE reason IS NOT NULL AND portal_email IS NOT NULL;

COMMENT ON COLUMN ai_ops_log.reason IS
  'Tipo semantico de la operacion (rule_setup, task_setup, task_execution_start, etc). '
  'Alineado con LEDGER_REASONS en src/lib/ai/ledger-schemas.ts. '
  'NULL en filas anteriores al deploy de Fase 7 (2026-09-25). '
  'El campo source se mantiene para backwards-compat con consumption-audit.ts.';

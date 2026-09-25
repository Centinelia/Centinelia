-- Fix round 1 Fase 3:
-- 1. Agrega columna locked_until para evitar race condition (I2) en el scheduler.
-- 2. Agrega status 'narrated' para runs donde el executor v1 narro pero no ejecuto tools reales (C1).
--
-- El check constraint en agent_task_runs.status se amplía para incluir 'narrated'.
-- locked_until en agent_tasks es NULL cuando la tarea no está bloqueada.

ALTER TABLE agent_tasks
  ADD COLUMN locked_until timestamptz;

-- Ampliar check constraint de status para incluir 'narrated'.
-- Nota: en Postgres no se puede modificar un check constraint in-place; se elimina y recrea.
ALTER TABLE agent_task_runs
  DROP CONSTRAINT IF EXISTS agent_task_runs_status_check;

ALTER TABLE agent_task_runs
  ADD CONSTRAINT agent_task_runs_status_check
    CHECK (status IN ('running', 'success', 'error', 'cancelled', 'narrated'));

COMMENT ON COLUMN agent_tasks.locked_until IS 'Timestamp hasta el que la tarea está bloqueada para ejecución. El scheduler omite tareas con locked_until > now() (evita race conditions en múltiples instancias de Vercel).';
COMMENT ON COLUMN agent_task_runs.status IS 'running | success | error | cancelled | narrated. "narrated" = executor v1 invocó al LLM pero no ejecutó tools reales (no se cobran task_action ops).';

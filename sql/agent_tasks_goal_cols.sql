-- agent_tasks: columnas para goal-loop y evaluación de criterio de éxito
-- Requeridas por delegar-tarea/route.ts (goal evaluation loop)

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS success_criteria  text,
  ADD COLUMN IF NOT EXISTS max_iterations    integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_iteration integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goal_met          boolean,
  ADD COLUMN IF NOT EXISTS eval_notes        text;

-- El status 'partial' se usa cuando el agente completó algo pero no cumplió el criterio de éxito
ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_status_check;

ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_status_check
    CHECK (status IN ('pending','in_progress','completed','partial','failed','cancelled'));

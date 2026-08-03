-- 20260803_task_plan_approval
-- F4 — plan-then-approve para delegar_tarea.
-- Cuando una tarea es larga o compleja, delegar-tarea produce un plan estructurado
-- y lo guarda como awaiting_plan_approval. Un correo con magic link permite al
-- dueño aprobar o rechazar antes de que se ejecute.

ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS plan                    jsonb,
  ADD COLUMN IF NOT EXISTS plan_approval_token     text,
  ADD COLUMN IF NOT EXISTS plan_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS plan_rejected_at        timestamptz,
  ADD COLUMN IF NOT EXISTS plan_rejection_reason   text,
  ADD COLUMN IF NOT EXISTS plan_approved_by        text;

-- Extend agent_tasks_status_check to allow the new gate status. The prior
-- constraint was defined in sql/loop-engineering.sql — we drop and re-add here
-- so awaiting_plan_approval is a valid value.
ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_status_check;
ALTER TABLE agent_tasks
  ADD  CONSTRAINT agent_tasks_status_check
    CHECK (status IN ('pending','in_progress','completed','partial','failed','cancelled','awaiting_plan_approval'));

CREATE INDEX IF NOT EXISTS agent_tasks_plan_token_idx
  ON agent_tasks(plan_approval_token)
  WHERE plan_approval_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_tasks_awaiting_approval_idx
  ON agent_tasks(portal_email, created_at DESC)
  WHERE status = 'awaiting_plan_approval';

-- Flag org-level: auto-aprobar planes sin gate humano (para clientes que confían full).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS auto_approve_task_plans boolean NOT NULL DEFAULT false;

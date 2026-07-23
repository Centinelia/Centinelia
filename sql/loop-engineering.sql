-- ── Loop Engineering — Goal-completion fields + Scheduled Tasks ───────────────
-- Run this in Supabase SQL Editor

-- 1. Add goal-completion columns to agent_tasks
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS success_criteria  text,
  ADD COLUMN IF NOT EXISTS max_iterations    int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_iteration int  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goal_met          boolean,
  ADD COLUMN IF NOT EXISTS eval_notes        text;

-- Allow 'partial' as a valid status
ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_status_check;
ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_status_check
    CHECK (status IN ('pending','in_progress','completed','partial','failed','cancelled'));

-- 2. Scheduled agent tasks — outer loop (recurring tasks)
CREATE TABLE IF NOT EXISTS scheduled_agent_tasks (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      text        NOT NULL,
  agent_id          uuid        REFERENCES voice_agents(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  description       text        NOT NULL,
  success_criteria  text,
  max_iterations    int         NOT NULL DEFAULT 3,
  frequency         text        NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('daily','weekly','monthly','custom')),
  schedule          jsonb       NOT NULL DEFAULT '{"hour": 9}'::jsonb,
  -- Examples:
  --   weekly:  {"day_of_week": 1, "hour": 9}   → Monday 9am
  --   daily:   {"hour": 8}                       → every day 8am
  --   monthly: {"day_of_month": 1, "hour": 8}   → 1st of month 8am
  active            boolean     NOT NULL DEFAULT true,
  last_run_at       timestamptz,
  next_run_at       timestamptz,
  last_result       text,
  last_status       text
    CHECK (last_status IN ('success','partial','failed') OR last_status IS NULL),
  last_goal_met     boolean,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_tasks_portal_idx    ON scheduled_agent_tasks (portal_email);
CREATE INDEX IF NOT EXISTS scheduled_tasks_next_run_idx  ON scheduled_agent_tasks (next_run_at) WHERE active = true;
CREATE INDEX IF NOT EXISTS scheduled_tasks_agent_idx     ON scheduled_agent_tasks (agent_id);

CREATE OR REPLACE FUNCTION update_scheduled_agent_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scheduled_agent_tasks_updated_at ON scheduled_agent_tasks;
CREATE TRIGGER scheduled_agent_tasks_updated_at
  BEFORE UPDATE ON scheduled_agent_tasks
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_agent_tasks_updated_at();

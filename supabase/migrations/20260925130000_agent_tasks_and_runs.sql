-- Tareas programadas por meerkat con dueño único.
-- FK a organizations por portal_email (convención Centinelia).
-- Ver spec Sección 4.5 y 4.6.
--
-- trigger_type: cron | manual | phrase
--   cron    → trigger_config={ cron, timezone, next_run_at }
--   phrase  → trigger_config={ phrases: [], match_mode? }
--   manual  → trigger_config={}
--
-- owner_agent_id es FK uuid a voice_agents (agente específico del cliente).
-- Un solo trigger_type por tarea (YAGNI).

CREATE TYPE task_trigger_type AS ENUM ('cron', 'manual', 'phrase');

CREATE TABLE agent_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email    text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  owner_agent_id  uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  mission         text NOT NULL,
  trigger_type    task_trigger_type NOT NULL,
  trigger_config  jsonb NOT NULL DEFAULT '{}',
  parameters      text,
  deliverable     text NOT NULL,
  active          bool NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,
  UNIQUE (owner_agent_id, slug)
);

CREATE INDEX agent_tasks_owner_active_idx ON agent_tasks (owner_agent_id, active);
CREATE INDEX agent_tasks_cron_active_idx ON agent_tasks (trigger_type, active)
  WHERE trigger_type = 'cron' AND active = true;
CREATE INDEX agent_tasks_portal_active_idx ON agent_tasks (portal_email, active);

CREATE OR REPLACE FUNCTION agent_tasks_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_tasks_updated_at
BEFORE UPDATE ON agent_tasks
FOR EACH ROW EXECUTE FUNCTION agent_tasks_touch_updated_at();

CREATE TABLE agent_task_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('running', 'success', 'error', 'cancelled')),
  trigger_source text NOT NULL CHECK (trigger_source IN ('cron', 'phrase', 'manual')),
  ledger_ops     int NOT NULL DEFAULT 0,
  error_message  text,
  metadata       jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX agent_task_runs_task_started_idx ON agent_task_runs (task_id, started_at DESC);

COMMENT ON TABLE agent_tasks IS 'Tareas programadas por meerkat. owner_agent_id es FK uuid a voice_agents (el agente específico del cliente). Un solo trigger_type por tarea (YAGNI).';
COMMENT ON TABLE agent_task_runs IS 'Historial de ejecuciones. ledger_ops es el total agregado de ops consumidos por esta ejecución (task_execution_start + task_action con batched-consume).';
COMMENT ON COLUMN agent_tasks.trigger_config IS 'jsonb con formato según trigger_type: cron={cron, timezone, next_run_at}, phrase={phrases: [], match_mode}, manual={}';

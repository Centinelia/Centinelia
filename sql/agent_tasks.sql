-- agent_tasks: registro de todas las tareas delegadas entre agentes
-- Nox las monitorea, escala las vencidas y reporta según se le configure.

CREATE TABLE IF NOT EXISTS agent_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email    text        NOT NULL,
  created_by      uuid        REFERENCES voice_agents(id) ON DELETE SET NULL,
  assigned_to     uuid        REFERENCES voice_agents(id) ON DELETE SET NULL,
  title           text        NOT NULL,
  description     text,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','failed','cancelled')),
  trigger_type    text        NOT NULL DEFAULT 'delegation'
    CHECK (trigger_type IN ('delegation','email','cron','manual')),
  source_context  text,
  result          text,
  due_at          timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_tasks_portal_email_idx  ON agent_tasks (portal_email);
CREATE INDEX IF NOT EXISTS agent_tasks_status_idx        ON agent_tasks (status);
CREATE INDEX IF NOT EXISTS agent_tasks_assigned_to_idx   ON agent_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS agent_tasks_due_at_idx        ON agent_tasks (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_tasks_created_by_idx    ON agent_tasks (created_by);

CREATE OR REPLACE FUNCTION update_agent_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_tasks_updated_at ON agent_tasks;
CREATE TRIGGER agent_tasks_updated_at
  BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION update_agent_tasks_updated_at();

-- insights_mode por organización
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS insight_mode TEXT DEFAULT 'llm'
    CHECK (insight_mode IN ('llm', 'rules'));

-- tabla de recomendaciones
CREATE TABLE IF NOT EXISTS agent_recommendations (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        TEXT        NOT NULL,
  agent_id      UUID        REFERENCES voice_agents(id) ON DELETE CASCADE,
  agent_name    TEXT        NOT NULL,
  agent_role    TEXT,
  week_start    DATE        NOT NULL,
  title         TEXT        NOT NULL,
  body          TEXT        NOT NULL,
  metric_key    TEXT,
  current_value NUMERIC,
  priority      TEXT        DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status        TEXT        DEFAULT 'nueva'  CHECK (status   IN ('nueva', 'aplicada', 'descartada')),
  mode          TEXT        NOT NULL DEFAULT 'llm' CHECK (mode IN ('llm', 'rules')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_rec_org_week  ON agent_recommendations (org_id, week_start);
CREATE INDEX IF NOT EXISTS idx_agent_rec_agent     ON agent_recommendations (agent_id);

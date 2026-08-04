-- H1: Trace unificado de tool calls
-- Todos los tool invocations pasan por executor.ts, cual escribe una fila
-- por invocación. Permite replay (H4), dashboards de cost/latency (H3), y
-- debugging cross-canal.

CREATE TABLE IF NOT EXISTS tool_call_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
  portal_email   TEXT,
  channel        TEXT NOT NULL CHECK (channel IN ('voice','chat','email','cron','delegate','consult')),
  session_id     TEXT,           -- vapi call_id, agent_chat session, inbox row id, etc.
  parent_id      UUID REFERENCES tool_call_log(id) ON DELETE SET NULL,
  tool_name      TEXT NOT NULL,
  input_json     JSONB,
  output_json    JSONB,
  ok             BOOLEAN NOT NULL DEFAULT TRUE,
  error          TEXT,
  latency_ms     INTEGER NOT NULL,
  attempt        SMALLINT NOT NULL DEFAULT 1,
  loop_id        UUID,            -- agrupa reintentos dentro de runGoalLoop
  meta           JSONB,           -- model, tokens_in/out, cost_usd, budget_used, etc.
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_call_log_agent_idx      ON tool_call_log (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_call_log_session_idx    ON tool_call_log (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_call_log_tool_idx       ON tool_call_log (tool_name, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_call_log_channel_idx    ON tool_call_log (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_call_log_loop_idx       ON tool_call_log (loop_id) WHERE loop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tool_call_log_portal_day_idx ON tool_call_log (portal_email, date_trunc('day', created_at));

-- Retention: 90d de detalle. Aggregates viven en analytics tables aparte.
-- Nazre puede correr manual:  DELETE FROM tool_call_log WHERE created_at < NOW() - INTERVAL '90 days';

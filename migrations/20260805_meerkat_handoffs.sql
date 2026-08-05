-- Graph engineering: handoffs meerkats como DAG.
--
-- 2 tablas:
--   1. meerkat_handoff_log: registro append-only de cada handoff real.
--      Cada vez que Sofia consulta a Nox o Nox delega a Noah, se escribe una fila.
--   2. meerkat_handoff_edges: edges declarativos con enable/disable.
--      Por default todos los pares están permitidos. Si Nazre crea una fila
--      con enabled=false, ese edge se bloquea (Nia → QB directo, por ejemplo).

CREATE TABLE IF NOT EXISTS meerkat_handoff_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      TEXT NOT NULL,
  from_meerkat      TEXT NOT NULL,        -- 'nia', 'noah', etc.
  to_meerkat        TEXT NOT NULL,
  tool_name         TEXT NOT NULL,        -- 'consultar_agente' | 'delegar_tarea'
  from_agent_id     UUID,                 -- voice_agent que originó
  to_agent_id       UUID,                 -- voice_agent que recibió
  task_summary      TEXT,                 -- 200 chars del tarea/rol
  outcome           TEXT,                 -- 'success' | 'rejected' | 'failed'
  agent_task_id     UUID,                 -- si delegar_tarea creó una tarea
  metadata          JSONB,
  handoff_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meerkat_handoff_log_pair_idx    ON meerkat_handoff_log (from_meerkat, to_meerkat, handoff_at DESC);
CREATE INDEX IF NOT EXISTS meerkat_handoff_log_portal_idx  ON meerkat_handoff_log (portal_email, handoff_at DESC);
CREATE INDEX IF NOT EXISTS meerkat_handoff_log_time_idx    ON meerkat_handoff_log (handoff_at DESC);

CREATE TABLE IF NOT EXISTS meerkat_handoff_edges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      TEXT,                 -- NULL = regla global; string = org-specific
  from_meerkat      TEXT NOT NULL,
  to_meerkat        TEXT NOT NULL,
  tool_name         TEXT,                 -- NULL = aplica a todos; 'consultar_agente' | 'delegar_tarea'
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  reason            TEXT,                 -- por qué está enabled/disabled
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_email, from_meerkat, to_meerkat, tool_name)
);

CREATE INDEX IF NOT EXISTS meerkat_handoff_edges_lookup_idx
  ON meerkat_handoff_edges (portal_email, from_meerkat, to_meerkat);

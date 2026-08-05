-- Graph engineering: registrar cada cambio de estado de agent_tasks.
-- Cada transición queda como fila append-only con quién, cuándo, por qué,
-- y metadata JSON. Sirve para timeline UI, auditoría, y detectar estados
-- imposibles (transitions inválidas rechazadas por el helper).

CREATE TABLE IF NOT EXISTS task_state_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  from_status       TEXT,                              -- NULL cuando es la creación
  to_status         TEXT NOT NULL,
  actor             TEXT NOT NULL,                     -- 'user', 'cron', 'executor', 'system', 'agent:<id>'
  reason            TEXT,                              -- humano-legible: 'user_approved_plan', 'cron_pickup', etc.
  metadata          JSONB,                             -- info extra: agent_name, iteration, error, etc.
  transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_state_transitions_task_idx  ON task_state_transitions (task_id, transitioned_at);
CREATE INDEX IF NOT EXISTS task_state_transitions_actor_idx ON task_state_transitions (actor, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS task_state_transitions_time_idx  ON task_state_transitions (transitioned_at DESC);

-- Retention: sin cleanup automático. Las transitions son el historial
-- audit. Si crecen mucho se puede rotar >180d con un cron manual.

-- Graph engineering (bandeja): registrar cada cambio de estado de ops_inbox.
-- Estados: pending, auto_replied, info_requested, skipped (terminal spam),
--          approved (humano aprobó), rejected (humano rechazó), archived.

CREATE TABLE IF NOT EXISTS inbox_state_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id          UUID NOT NULL REFERENCES ops_inbox(id) ON DELETE CASCADE,
  from_status       TEXT,                              -- NULL cuando es la creación
  to_status         TEXT NOT NULL,
  actor             TEXT NOT NULL,                     -- 'inbox_processor', 'classifier', 'user', 'thread_resume', 'cron', 'system'
  reason            TEXT,                              -- humano-legible: 'classifier_send', 'user_approved', 'thread_reply', etc.
  metadata          JSONB,                             -- info extra: category, decision, tokens, etc.
  transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbox_state_transitions_inbox_idx  ON inbox_state_transitions (inbox_id, transitioned_at);
CREATE INDEX IF NOT EXISTS inbox_state_transitions_actor_idx  ON inbox_state_transitions (actor, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS inbox_state_transitions_time_idx   ON inbox_state_transitions (transitioned_at DESC);

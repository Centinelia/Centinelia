-- Graph engineering: transiciones de outbound_contacts (campañas salientes).
-- Estados:
--   pending    — subido a la campaña, esperando cron pickup
--   calling    — cron intentó marcarlo (Vapi call en curso)
--   completed  — llamada contestada, marcaje terminado (terminal)
--   no_answer  — no contestó, esperando próximo retry (regresa a pending)
--   failed     — error irrecoverable o 3+ fails (terminal)
--   dnc        — cliente pidió no ser llamado (terminal legal LFPDPPP)

CREATE TABLE IF NOT EXISTS outbound_state_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        UUID NOT NULL REFERENCES outbound_contacts(id) ON DELETE CASCADE,
  from_status       TEXT,
  to_status         TEXT NOT NULL,
  actor             TEXT NOT NULL,          -- 'user', 'cron', 'vapi_webhook', 'agent', 'system'
  reason            TEXT,
  metadata          JSONB,
  transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outbound_state_transitions_contact_idx ON outbound_state_transitions (contact_id, transitioned_at);
CREATE INDEX IF NOT EXISTS outbound_state_transitions_actor_idx   ON outbound_state_transitions (actor, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS outbound_state_transitions_time_idx    ON outbound_state_transitions (transitioned_at DESC);

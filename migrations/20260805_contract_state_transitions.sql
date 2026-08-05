-- Graph engineering (contratos): historial de transiciones de contract_drafts.
-- Estados actuales usados en el código:
--   borrador   — recién creado por el agente
--   enviado    — dueño envió al cliente (con link de firma o correo)
--   firmado    — cliente firmó (opcional, cuando esté implementado)
--   cancelado  — dueño canceló antes de enviar o después
--   rechazado  — cliente rechazó (opcional)

CREATE TABLE IF NOT EXISTS contract_state_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       UUID NOT NULL REFERENCES contract_drafts(id) ON DELETE CASCADE,
  from_status       TEXT,
  to_status         TEXT NOT NULL,
  actor             TEXT NOT NULL,
  reason            TEXT,
  metadata          JSONB,
  transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contract_state_transitions_contract_idx ON contract_state_transitions (contract_id, transitioned_at);
CREATE INDEX IF NOT EXISTS contract_state_transitions_actor_idx    ON contract_state_transitions (actor, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS contract_state_transitions_time_idx     ON contract_state_transitions (transitioned_at DESC);

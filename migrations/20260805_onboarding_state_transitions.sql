-- Graph engineering: transiciones de onboarding_instances (Naia).
-- Estados:
--   pendiente   — Naia envió link al cliente, esperando respuesta
--   en_proceso  — cliente subió docs / respondió formulario
--   completado  — dueño del negocio marcó como cerrado
--   cancelado   — dueño canceló el onboarding

CREATE TABLE IF NOT EXISTS onboarding_state_transitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id       UUID NOT NULL REFERENCES onboarding_instances(id) ON DELETE CASCADE,
  from_status       TEXT,
  to_status         TEXT NOT NULL,
  actor             TEXT NOT NULL,          -- 'agent:<uuid>', 'client', 'user', 'system'
  reason            TEXT,
  metadata          JSONB,
  transitioned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_state_transitions_instance_idx ON onboarding_state_transitions (instance_id, transitioned_at);
CREATE INDEX IF NOT EXISTS onboarding_state_transitions_actor_idx    ON onboarding_state_transitions (actor, transitioned_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_state_transitions_time_idx     ON onboarding_state_transitions (transitioned_at DESC);

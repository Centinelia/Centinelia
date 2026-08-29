-- Fase 5: bitácora es concepto empleado-level, no org-level.
-- Cada empleado (voice_agent) tiene su plantilla + config de envío.

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS bitacora_template JSONB,
  ADD COLUMN IF NOT EXISTS bitacora_weekly_config JSONB
    DEFAULT '{"enabled": false, "day_of_week": 6, "hour": 14, "recipients": [], "include_monthly_last_saturday": true}'::jsonb;

COMMENT ON COLUMN voice_agents.bitacora_template IS
  'Custom bitácora template subido por el cliente y analizado por AI. NULL = usar default Centinelia. Empleado-level (movido desde organizations en Fase 5).';

COMMENT ON COLUMN voice_agents.bitacora_weekly_config IS
  'Config envío semanal bitácora por empleado. Cada empleado tiene su propio day/hour/recipients.';

-- bitacora_weekly_deliveries: idempotencia ahora es per-agent (no per-org).
DROP TABLE IF EXISTS bitacora_weekly_deliveries;

CREATE TABLE bitacora_weekly_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  week_start       DATE NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipients       TEXT[] NOT NULL,
  included_monthly BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (agent_id, week_start)
);

CREATE INDEX idx_bitacora_deliveries_agent ON bitacora_weekly_deliveries(agent_id);

ALTER TABLE bitacora_weekly_deliveries ENABLE ROW LEVEL SECURITY;

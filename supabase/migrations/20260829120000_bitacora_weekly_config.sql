-- 2026-08-29: Config del envío automático semanal de bitácora.
-- Cron corre cada hora, matchea orgs con enabled=true cuya day_of_week + hour
-- coincidan con la hora MX actual. Genera Excel semanal y lo envía. Si es el
-- último sábado del mes y include_monthly_last_saturday=true, adjunta también
-- el Excel mensual acumulado.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS bitacora_weekly_config JSONB
    DEFAULT '{"enabled": false, "day_of_week": 6, "hour": 14, "recipients": [], "include_monthly_last_saturday": true}'::jsonb;

COMMENT ON COLUMN organizations.bitacora_weekly_config IS
  'Config envío semanal bitácora. Fields: enabled (bool), day_of_week (0=dom..6=sab, default 6=sab), hour (0-23 MX time, default 14), recipients (string[] emails), include_monthly_last_saturday (bool, agrega Excel mensual el último sábado del mes).';

-- Track del último envío para idempotencia. Sin esto, si el cron corre 2x
-- en la misma hora (rare pero posible con Vercel retries), llegan 2 correos.
CREATE TABLE IF NOT EXISTS bitacora_weekly_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  TEXT NOT NULL,
  week_start    DATE NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipients    TEXT[] NOT NULL,
  included_monthly BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (portal_email, week_start)
);

CREATE INDEX IF NOT EXISTS idx_bitacora_deliveries_portal ON bitacora_weekly_deliveries(portal_email);

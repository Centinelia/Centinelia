-- nox-monthly-reports: idempotency + histórico de reportes mensuales de Nox.
-- Se inserta un row cuando el cron cron/nox-monthly-report envía el resumen del mes previo.
-- La unique constraint (portal_email, month_key) previene duplicados si el cron reintenta.

CREATE TABLE IF NOT EXISTS nox_monthly_reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email text        NOT NULL,
  month_key    text        NOT NULL,           -- YYYY-MM del mes reportado
  metrics      jsonb       NOT NULL DEFAULT '{}',
  summary      text        NOT NULL,
  sent_to      text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_email, month_key)
);

CREATE INDEX IF NOT EXISTS nox_monthly_reports_portal_idx
  ON nox_monthly_reports (portal_email, created_at DESC);

ALTER TABLE nox_monthly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON nox_monthly_reports
  USING (false)
  WITH CHECK (false);

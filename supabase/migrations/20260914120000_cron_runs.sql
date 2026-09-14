-- cron_runs — observabilidad estructurada de crons.
--
-- Cada corrida de un cron envuelto en defineCron() inserta un row al inicio
-- (status='running') y hace UPDATE al final con duration_ms + counts + status.
--
-- Uso downstream:
--   - Dashboard "últimas 24h por cron" en /admin/monitor
--   - Nash puede leer directamente para alertar crons que llevan 3+ runs
--     partial/error consecutivos
--   - Métricas de duración p50/p95 por cron

CREATE TABLE IF NOT EXISTS cron_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name     text NOT NULL,
  started_at    timestamptz NOT NULL,
  ended_at      timestamptz,
  duration_ms   integer,
  status        text NOT NULL CHECK (status IN ('running', 'ok', 'partial', 'error', 'timeout')),
  expected      integer,
  processed     integer,
  errors_count  integer,
  error_sample  text,
  metadata      jsonb
);

-- Consulta típica: "últimos 20 runs de heartbeat".
CREATE INDEX IF NOT EXISTS cron_runs_by_cron_started
  ON cron_runs (cron_name, started_at DESC);

-- Consulta típica Nash: "cualquier cron con fallo en la última hora".
CREATE INDEX IF NOT EXISTS cron_runs_failing
  ON cron_runs (started_at DESC)
  WHERE status IN ('error', 'partial', 'timeout');

-- Cleanup automático — mantener 30 días. Se corre desde el cron
-- cleanup-analytics (que ya limpia tablas de retention corta).
-- ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = 0.05); -- opcional cuando crezca

COMMENT ON TABLE cron_runs IS
'Observabilidad de crons envueltos en defineCron(). Ver src/lib/cron/define-cron.ts.';

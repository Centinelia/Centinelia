-- migrations/20260731_heartbeat_runs.sql
-- Persistir check-ins de coordinators (Nox, Niva) para mostrar en Oficina · Reportes.
-- Retention 30 días implícita en query (WHERE ran_at > NOW() - INTERVAL '30 days').
-- Rows viejos quedan hasta que decidamos si hacer cron de purga.

CREATE TABLE IF NOT EXISTS heartbeat_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email TEXT NOT NULL,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frequency    TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  subject      TEXT NOT NULL,
  content_md   TEXT NOT NULL,
  read_at      TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS heartbeat_runs_portal_ran
  ON heartbeat_runs(portal_email, ran_at DESC);

CREATE INDEX IF NOT EXISTS heartbeat_runs_unread
  ON heartbeat_runs(portal_email, read_at) WHERE read_at IS NULL;

-- RLS deshabilitada (consistente con ops_report_runs y todo el portal:
-- acceso vía createAdminClient + validación de sesión en cada API route).

-- Ops Ledger — event-sourced tracking de tareas/ops con paridad completa a minutes_ledger
-- Ver docs/superpowers/specs/2026-08-09-ops-ledger-design.md

-- 1) Tabla append-only de eventos
CREATE TABLE IF NOT EXISTS ops_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  text,
  agent_id      uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  amount        int NOT NULL,
  kind          text NOT NULL,
  source        text,
  reference_id  text,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_ledger_portal_email_idx  ON ops_ledger (portal_email);
CREATE INDEX IF NOT EXISTS ops_ledger_reference_id_idx  ON ops_ledger (reference_id);
CREATE INDEX IF NOT EXISTS ops_ledger_kind_created_idx  ON ops_ledger (kind, created_at DESC);

-- 2) Tabla cache derivada (mirror de account_minutes)
CREATE TABLE IF NOT EXISTS account_ops (
  portal_email    text PRIMARY KEY,
  ops_included    int NOT NULL DEFAULT 0,
  ops_used        int NOT NULL DEFAULT 0,
  ops_balance     int NOT NULL DEFAULT 0,
  ops_reset_date  date,
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

-- 3) Feature flag por org para rollout gradual
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ops_ledger_enabled boolean NOT NULL DEFAULT false;

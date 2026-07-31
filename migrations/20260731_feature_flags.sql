-- Pilar 3 evolution framework: feature flags con rollout gradual
-- Ver docs/superpowers/specs/2026-07-31-feature-flags-rollout-design.md

BEGIN;

CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key       TEXT PRIMARY KEY,
  description    TEXT NOT NULL,
  rollout_pct    INT  NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  allowlist      TEXT[] NOT NULL DEFAULT '{}',
  denylist       TEXT[] NOT NULL DEFAULT '{}',
  killed         BOOLEAN NOT NULL DEFAULT FALSE,
  default_on     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT
);

CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id          BIGSERIAL PRIMARY KEY,
  flag_key    TEXT NOT NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('created','updated','killed','unkilled','deleted')),
  before      JSONB,
  after       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flag_audit_key_time ON feature_flag_audit(flag_key, created_at DESC);

CREATE TABLE IF NOT EXISTS feature_flag_daily_snapshots (
  flag_key TEXT NOT NULL,
  day      DATE NOT NULL,
  counts   JSONB NOT NULL,
  PRIMARY KEY (flag_key, day)
);

COMMIT;

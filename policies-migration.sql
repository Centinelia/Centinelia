-- ─────────────────────────────────────────────────────────────────────────
-- Policy Engine — Migration
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────

-- 1. agent_policies — one row per agent per capability
--    Missing row = default allow (open by default, opt-in restrictions)

CREATE TABLE IF NOT EXISTS agent_policies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id           UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  capability         TEXT NOT NULL,          -- 'email', 'files', 'phone', 'calendar', 'crm'
  enabled            BOOLEAN NOT NULL DEFAULT true,
  preferred_provider TEXT,                   -- null = auto-select first connected account
  requires_approval  BOOLEAN NOT NULL DEFAULT false,
  audit_log          BOOLEAN NOT NULL DEFAULT true,
  limits             JSONB    NOT NULL DEFAULT '{}',  -- { max_per_day: 50, ... }
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, capability)
);

CREATE OR REPLACE FUNCTION update_agent_policies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_agent_policies_updated_at ON agent_policies;
CREATE TRIGGER trg_agent_policies_updated_at
  BEFORE UPDATE ON agent_policies
  FOR EACH ROW EXECUTE FUNCTION update_agent_policies_updated_at();

-- 2. policy_audit_log — every tool execution that goes through the engine

CREATE TABLE IF NOT EXISTS policy_audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  action     TEXT NOT NULL,       -- e.g. 'email.send_email', 'files.search_files'
  provider   TEXT,                -- which provider was used
  account    TEXT,                -- which account (email address, etc.)
  details    JSONB DEFAULT '{}',  -- sanitized payload (no tokens, limited PII)
  status     TEXT NOT NULL DEFAULT 'completed'
             CHECK (status IN ('completed', 'blocked', 'pending_approval', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for portal audit log queries (by agent, recent first)
CREATE INDEX IF NOT EXISTS idx_policy_audit_log_agent_created
  ON policy_audit_log (agent_id, created_at DESC);

-- RLS — service role bypasses automatically; no public policies needed
ALTER TABLE agent_policies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_audit_log ENABLE ROW LEVEL SECURITY;

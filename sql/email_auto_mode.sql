-- Email auto-mode classifier — schema changes
-- Spec: docs/superpowers/specs/2026-07-30-email-auto-mode-classifier-design.md
-- NO se hace backfill aquí. Fallback en código maneja NULL.

BEGIN;

-- voice_agents: tri-estado auto_mode
ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS auto_mode text
  CHECK (auto_mode IS NULL OR auto_mode IN ('off','auto','always'));

-- organizations: kill switch per-org + notify idempotency
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS auto_mode_disabled_at timestamptz;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS auto_mode_notified_at timestamptz;

-- ops_inbox: audit + feedback
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS auto_mode_decision text
  CHECK (auto_mode_decision IS NULL OR auto_mode_decision IN ('send','human','block'));
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS auto_mode_reason text;
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS auto_mode_signals jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS auto_mode_flagged_at timestamptz;
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS auto_mode_flag_reason text;
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS digest_sent_at timestamptz;

-- Dedup guard para evitar doble webhook del mismo mensaje
CREATE UNIQUE INDEX IF NOT EXISTS ops_inbox_unique_message
  ON ops_inbox (agent_id, raw_message_id)
  WHERE raw_message_id IS NOT NULL;

-- Feedback log (foundation para re-tuning futuro)
CREATE TABLE IF NOT EXISTS auto_mode_feedback_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES voice_agents(id) ON DELETE CASCADE,
  inbox_id uuid REFERENCES ops_inbox(id) ON DELETE CASCADE,
  decision text NOT NULL,
  signals jsonb DEFAULT '[]'::jsonb,
  flagged_at timestamptz DEFAULT NOW(),
  flag_reason text
);

CREATE INDEX IF NOT EXISTS auto_mode_feedback_log_agent_id_idx
  ON auto_mode_feedback_log (agent_id, flagged_at DESC);

COMMIT;

-- Refactor latencia email: SMTP+IMAP a background jobs.
-- Ver spec: docs/superpowers/specs/2026-09-29-refactor-latencia-email-background-design.md
-- Motivación: el bug Tortillería/Tecate Six 2026-09-29 tuvo root cause en la
-- latencia ~15s del envío inline (SMTP+IMAP APPEND). Modelo timeout →
-- reinvoca → duplicados. Este table + cron elimina la latencia sync.

CREATE TABLE IF NOT EXISTS email_send_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email      text NOT NULL,

  -- Payload
  to_addr           text NOT NULL,
  subject           text NOT NULL,
  html              text NOT NULL,
  reply_to          text,
  from_addr         text,
  attachment_url    text,
  attachment_name   text,
  attachment_mime   text,

  -- Origen y contabilidad
  source            text NOT NULL,
  reference_id      text,
  charge_source     text,
  charge_label      text,
  source_table      text,
  source_row_id     text,

  -- Ciclo de vida
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts          int  NOT NULL DEFAULT 0,
  max_attempts      int  NOT NULL DEFAULT 5,
  next_attempt_at   timestamptz NOT NULL DEFAULT NOW(),
  last_error        text,
  provider          text,
  provider_meta     jsonb,

  -- Timestamps
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  processing_at     timestamptz,
  delivered_at      timestamptz,
  failed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_jobs_pending
  ON email_send_jobs (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_jobs_agent_source
  ON email_send_jobs (agent_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_jobs_stuck
  ON email_send_jobs (created_at)
  WHERE status IN ('pending', 'processing');

-- RLS obligatorio (feedback_rls_public_tables_default, PR #82)
ALTER TABLE email_send_jobs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE email_send_jobs IS
  'Background jobs para envío de email (SMTP+IMAP APPEND). Executors enqueue y responden <2s; cron /api/cron/process-email-jobs procesa con retry exponencial. Ver docs/superpowers/specs/2026-09-29-refactor-latencia-email-background-design.md.';

-- Feature flag org para rollout gradual
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_jobs_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.email_jobs_enabled IS
  'Refactor latencia email (spec 2026-09-29). Cuando true, los tools con side-effect de email encolan en email_send_jobs y responden al modelo <2s. Cuando false, envían inline como legacy. Default false; rollout Tortillería → pilotos → global.';

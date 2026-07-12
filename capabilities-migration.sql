-- ─────────────────────────────────────────────────────────────────────────
-- Capabilities Architecture — Migration
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────

-- 1. provider_capabilities — static lookup: which capability does each provider serve
--    Seeded with all known providers. Add rows as new providers are integrated.

CREATE TABLE IF NOT EXISTS provider_capabilities (
  provider   TEXT NOT NULL,
  capability TEXT NOT NULL,
  PRIMARY KEY (provider, capability)
);

INSERT INTO provider_capabilities (provider, capability) VALUES
  -- Email
  ('gmail',           'email'),
  ('outlook',         'email'),
  ('smtp',            'email'),
  ('imap',            'email'),
  -- Calendar
  ('cal_com',         'calendar'),
  ('calendly',        'calendar'),
  ('google_calendar', 'calendar'),
  ('outlook_calendar','calendar'),
  ('caldav',          'calendar'),
  -- Files
  ('google_drive',    'files'),
  ('onedrive',        'files'),
  ('dropbox',         'files'),
  ('sharepoint',      'files'),
  ('s3',              'files'),
  -- CRM / Knowledge
  ('notion',          'crm'),
  ('notion',          'knowledge'),
  -- Messaging
  ('teams',           'messaging'),
  ('whatsapp',        'messaging'),
  -- Payments
  ('stripe',          'payments'),
  -- Phone
  ('twilio',          'phone')
ON CONFLICT (provider, capability) DO NOTHING;

-- 2. integration_accounts — org-level integration credentials
--    Keyed by portal_email (the organization identifier in Centinelia).
--    Replaces / extends email_integrations which was agent-level.

CREATE TABLE IF NOT EXISTS integration_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email    TEXT NOT NULL,
  provider        TEXT NOT NULL,
  capability      TEXT NOT NULL,
  account_label   TEXT,                    -- display name / email address
  access_token    TEXT,                    -- encrypted at app level before storing
  refresh_token   TEXT,                    -- encrypted at app level before storing
  expires_at      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'needs_reauth', 'disconnected')),
  metadata        JSONB DEFAULT '{}',      -- provider-specific extras (workspace_id, db_id, etc.)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (portal_email, provider)          -- one account per provider per org
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_integration_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_integration_accounts_updated_at ON integration_accounts;
CREATE TRIGGER trg_integration_accounts_updated_at
  BEFORE UPDATE ON integration_accounts
  FOR EACH ROW EXECUTE FUNCTION update_integration_accounts_updated_at();

-- RLS: only allow access via service role (admin client) — portal auth handled at API layer
ALTER TABLE integration_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_capabilities ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically; no public policies needed.

-- ─────────────────────────────────────────────────────────────────────────
-- NOTE: existing email_integrations table (agent-level) remains untouched.
-- New integrations will write to integration_accounts.
-- Migration of existing rows can be done with:
--
--   INSERT INTO integration_accounts (portal_email, provider, capability, account_label,
--     access_token, refresh_token, expires_at, status, created_at)
--   SELECT
--     va.portal_email,
--     ei.provider,
--     'email',
--     ei.email,
--     ei.access_token,
--     ei.refresh_token,
--     ei.token_expires_at,
--     CASE WHEN ei.needs_reauth THEN 'needs_reauth' ELSE 'active' END,
--     ei.created_at
--   FROM email_integrations ei
--   JOIN voice_agents va ON va.id = ei.agent_id
--   WHERE va.portal_email IS NOT NULL
--   ON CONFLICT (portal_email, provider) DO NOTHING;
--
-- ─────────────────────────────────────────────────────────────────────────

-- billing_incoming_emails: persists each inbound email webhook received by
-- the billing empleado digital. Org identity uses portal_email (TEXT PK on
-- organizations) following the codebase convention (see ops_ledger, sheets_mappings).
--
-- Auth path: service_role only (createAdminClient). RLS enabled but no public
-- policies — service_role bypasses RLS by default.
--
-- message_id stores the Message-ID header from the inbound email for SMTP
-- threading when replyToInboundEmail constructs In-Reply-To / References.

CREATE TABLE IF NOT EXISTS billing_incoming_emails (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email     TEXT        NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  integration_id   UUID        NOT NULL REFERENCES organization_integrations(id) ON DELETE CASCADE,
  from_address     TEXT        NOT NULL,
  to_address       TEXT        NOT NULL,
  subject          TEXT,
  body_text        TEXT,
  attachment_count INT         NOT NULL DEFAULT 0,
  raw_payload      JSONB       NOT NULL,
  message_id       TEXT,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS billing_incoming_emails_portal_time_idx
  ON billing_incoming_emails (portal_email, received_at DESC);

ALTER TABLE billing_incoming_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_incoming_emails_service_only ON billing_incoming_emails
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE billing_incoming_emails IS
  'Inbound webhook emails received by the billing empleado digital. '
  'Each row corresponds to one POST to /api/billing/inbox from the Resend inbound webhook. '
  'message_id is used for SMTP threading in reply emails (In-Reply-To / References headers). '
  'Accessed exclusively via service_role.';

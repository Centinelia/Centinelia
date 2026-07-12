-- organizations: one canonical record per client account, keyed by portal_email.
-- Provides a stable anchor for org-level settings, plan, and future multi-user auth.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS organizations (
  portal_email       text        PRIMARY KEY,
  name               text,
  plan               text        NOT NULL DEFAULT 'starter',
  stripe_customer_id text,
  logo_url           text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Auto-create org row whenever a new voice_agent with portal_email is inserted.
-- ON CONFLICT DO NOTHING: adding a second agent to the same account is a no-op.
CREATE OR REPLACE FUNCTION ensure_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $ensure_organization$
BEGIN
  IF NEW.portal_email IS NOT NULL THEN
    INSERT INTO organizations (portal_email, name, plan, stripe_customer_id)
    VALUES (
      NEW.portal_email,
      COALESCE(NEW.business_name, NEW.portal_email),
      COALESCE(NEW.plan, 'starter'),
      NEW.stripe_customer_id
    )
    ON CONFLICT (portal_email) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$ensure_organization$;

DROP TRIGGER IF EXISTS trg_ensure_organization ON voice_agents;
CREATE TRIGGER trg_ensure_organization
  AFTER INSERT ON voice_agents
  FOR EACH ROW
  EXECUTE FUNCTION ensure_organization();

-- Backfill: create org rows for all existing portal_emails.
-- Uses MAX() so the first non-null value wins for each column.
INSERT INTO organizations (portal_email, name, plan, stripe_customer_id)
SELECT
  portal_email,
  MAX(business_name)        AS name,
  COALESCE(MAX(plan), 'starter') AS plan,
  MAX(stripe_customer_id)   AS stripe_customer_id
FROM voice_agents
WHERE portal_email IS NOT NULL
GROUP BY portal_email
ON CONFLICT (portal_email) DO NOTHING;

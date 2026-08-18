-- billing_jobs: async job queue for the billing employee inbox processor.
-- Rows are claimed atomically via the claim_billing_job RPC (SELECT FOR UPDATE SKIP LOCKED).
-- Only service_role has access (RLS policy below).

CREATE TABLE billing_jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email   TEXT        NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  integration_id UUID        NOT NULL REFERENCES organization_integrations(id) ON DELETE CASCADE,
  kind           TEXT        NOT NULL,
  payload        JSONB       NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts       INT         NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ
);

CREATE INDEX billing_jobs_pending_idx
  ON billing_jobs (status, created_at)
  WHERE status = 'pending';

ALTER TABLE billing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_jobs_service_only
  ON billing_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RPC: atomically claims one pending billing job (FOR UPDATE SKIP LOCKED).
-- Returns the claimed row or empty set if nothing is pending.
-- Call via supabase.rpc('claim_billing_job').
CREATE OR REPLACE FUNCTION claim_billing_job()
RETURNS SETOF billing_jobs
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE billing_jobs
  SET
    status     = 'running',
    attempts   = attempts + 1,
    started_at = NOW()
  WHERE id = (
    SELECT id
    FROM   billing_jobs
    WHERE  status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

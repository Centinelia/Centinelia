-- account_minutes: one shared pool per client account (keyed by portal_email).
-- All voice_agents that share the same portal_email draw from this single pool.

CREATE TABLE IF NOT EXISTS account_minutes (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email       text        NOT NULL UNIQUE,
  minutes_included   integer     NOT NULL DEFAULT 0,
  minutes_used       integer     NOT NULL DEFAULT 0,
  minutes_plan       text,
  minutes_reset_date date        NOT NULL DEFAULT CURRENT_DATE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Migrate existing per-agent data: aggregate by portal_email
INSERT INTO account_minutes (portal_email, minutes_included, minutes_used, minutes_plan, minutes_reset_date)
SELECT
  portal_email,
  COALESCE(SUM(minutes_included), 0)              AS minutes_included,
  COALESCE(SUM(minutes_used), 0)                  AS minutes_used,
  MAX(minutes_plan)                               AS minutes_plan,
  COALESCE(MAX(minutes_reset_date), CURRENT_DATE) AS minutes_reset_date
FROM voice_agents
WHERE portal_email IS NOT NULL
GROUP BY portal_email
ON CONFLICT (portal_email) DO UPDATE SET
  minutes_included   = EXCLUDED.minutes_included,
  minutes_used       = EXCLUDED.minutes_used,
  minutes_plan       = EXCLUDED.minutes_plan,
  minutes_reset_date = EXCLUDED.minutes_reset_date,
  updated_at         = now();

-- RPC: safely increment minutes_used for an account (called from Vapi webhook after each call)
CREATE OR REPLACE FUNCTION increment_account_minutes_used(p_portal_email text, minutes integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE account_minutes
  SET minutes_used = minutes_used + minutes,
      updated_at   = now()
  WHERE portal_email = p_portal_email;
END;
$$;

-- Spending guardrails: block agents when monthly limit is reached,
-- and enforce optional per-account daily minute caps.
--
-- Run this once in Supabase SQL editor.

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS daily_minutes_cap INTEGER;

COMMENT ON COLUMN voice_agents.daily_minutes_cap IS
  'Optional per-account cap (minutes/day). When set and reached, the agent stops answering for the rest of the day. Configurable from admin.';

-- Helper: sum of minutes used today by any agent of the same account (portal_email)
CREATE OR REPLACE FUNCTION account_minutes_today(p_portal_email TEXT)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(SUM(c.duration_seconds), 0)::NUMERIC / 60
  FROM voice_calls c
  JOIN voice_agents a ON a.id = c.agent_id
  WHERE a.portal_email = p_portal_email
    AND c.created_at >= (NOW() AT TIME ZONE 'America/Monterrey')::date AT TIME ZONE 'America/Monterrey';
$$;

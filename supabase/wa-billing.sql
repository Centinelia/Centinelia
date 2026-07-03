-- ─────────────────────────────────────────────────────────────────────────────
-- CentinelIA — WhatsApp billing columns & RPC
-- Run AFTER merge-wa-schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Billing columns on voice_agents
ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS wa_messages_plan     text
    CHECK (wa_messages_plan IN ('wa_200', 'wa_500', 'wa_1000')),
  ADD COLUMN IF NOT EXISTS wa_messages_included integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wa_messages_used     integer NOT NULL DEFAULT 0;

-- 2. Atomic counter increment (safe under concurrent requests)
CREATE OR REPLACE FUNCTION increment_wa_messages_used(
  p_agent_id uuid,
  p_count    int DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE voice_agents
     SET wa_messages_used = wa_messages_used + p_count
   WHERE id = p_agent_id;
END;
$$;

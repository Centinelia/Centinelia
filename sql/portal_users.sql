-- Sub-user system for portal access control
-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS portal_users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    text        NOT NULL,          -- portal_email of the master account (voice_agents.portal_email)
  email         text        NOT NULL,
  name          text,
  password_hash text,
  modules       text[]      NOT NULL DEFAULT '{}',   -- allowed module IDs (see src/lib/portal/modules.ts)
  agent_ids     uuid[],                              -- null = all agents in account
  is_owner      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS portal_users_account_id ON portal_users (account_id);

-- Row-level security: allow reads only with service_role (admin client)
ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON portal_users
  USING (false)
  WITH CHECK (false);

-- Onboarding alignment fields
-- Run in Supabase SQL editor

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS organization_mission text,
  ADD COLUMN IF NOT EXISTS service_definition   text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean;

-- Existing accounts are already set up — skip onboarding for them
UPDATE voice_agents
  SET onboarding_completed = true
  WHERE onboarding_completed IS NULL;

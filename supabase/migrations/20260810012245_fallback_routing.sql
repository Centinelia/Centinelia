-- Safety net: fallback de llamadas cuando se agotan minutos
-- Ver docs/superpowers/specs/2026-08-09-safety-net-minutos-fallback-design.md

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS fallback_phone_number text,
  ADD COLUMN IF NOT EXISTS fallback_notified_at  timestamptz;

CREATE TABLE IF NOT EXISTS routing_transitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      text NOT NULL,
  agent_id          uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  caller_number     text,
  transition        text NOT NULL CHECK (transition IN ('fallback_activated', 'fallback_restored', 'no_fallback_paused')),
  minutes_used      integer,
  minutes_included  integer,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_transitions_org_time_idx
  ON routing_transitions (portal_email, created_at DESC);

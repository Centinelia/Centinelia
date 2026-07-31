-- Human handoff — schema changes
-- Spec: docs/superpowers/specs/2026-07-30-human-handoff-design.md

BEGIN;

-- Tabla principal
CREATE TABLE IF NOT EXISTS human_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              uuid NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  source_channel        text NOT NULL CHECK (source_channel IN ('voice','chat','email')),
  source_inbox_id       uuid REFERENCES ops_inbox(id) ON DELETE SET NULL,
  source_call_id        uuid REFERENCES voice_calls(id) ON DELETE SET NULL,
  source_context        text,
  request_type          text NOT NULL CHECK (request_type IN ('info','action','approval')),
  title                 text NOT NULL,
  description           text NOT NULL,
  urgency               text NOT NULL DEFAULT 'media' CHECK (urgency IN ('baja','media','alta')),
  needed_by             timestamptz,
  target_email          text NOT NULL,
  target_type           text NOT NULL CHECK (target_type IN ('approver','owner','specific')),
  channels_notified     text[] DEFAULT '{}',
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','responded','escalated','cancelled','timeout')),
  response_text         text,
  response_files        jsonb DEFAULT '[]'::jsonb,
  response_action       text CHECK (response_action IS NULL OR response_action IN ('done','cannot_do','partial')),
  escalated_to_email    text,
  escalated_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz DEFAULT NOW(),
  reminded_at           timestamptz,
  responded_at          timestamptz,
  cancelled_at          timestamptz,
  resume_triggered_at   timestamptz
);

CREATE INDEX IF NOT EXISTS human_requests_agent_status_idx
  ON human_requests (agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS human_requests_target_idx
  ON human_requests (target_email, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS human_requests_timeout_idx
  ON human_requests (status, created_at) WHERE status IN ('pending','escalated');

-- Org kill switch
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS human_handoff_disabled_at timestamptz;

-- Source folder tracking (Q5 - spam rescue)
ALTER TABLE ops_inbox
  ADD COLUMN IF NOT EXISTS source_folder text DEFAULT 'inbox'
  CHECK (source_folder IS NULL OR source_folder IN ('inbox','spam_rescued','spam_confirmed'));

COMMIT;

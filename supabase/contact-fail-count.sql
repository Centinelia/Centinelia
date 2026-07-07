-- Contact failure tracking
-- Run in Supabase SQL Editor

ALTER TABLE outbound_contacts
  ADD COLUMN IF NOT EXISTS fail_count integer NOT NULL DEFAULT 0;

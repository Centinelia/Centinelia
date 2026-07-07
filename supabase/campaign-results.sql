-- Campaign results tracking
-- Run in Supabase SQL Editor

-- 1. Link outbound calls to the campaign that triggered them
ALTER TABLE outbound_calls
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES outbound_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_calls_campaign_id
  ON outbound_calls(campaign_id);

-- 2. Track call source on contacts (manual vs csv vs inbound callback)
ALTER TABLE outbound_contacts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('llamada_entrante', 'csv', 'manual'));

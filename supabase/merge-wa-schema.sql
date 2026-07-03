-- ─────────────────────────────────────────────────────────────────────────────
-- CentinelIA — Merge WhatsApp into voice_agents
-- Run AFTER schema.sql, whatsapp-schema.sql, and outbound-schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add WhatsApp capability columns to voice_agents
ALTER TABLE voice_agents ADD COLUMN IF NOT EXISTS wa_phone_number     text;
ALTER TABLE voice_agents ADD COLUMN IF NOT EXISTS capture_leads       boolean NOT NULL DEFAULT false;
ALTER TABLE voice_agents ADD COLUMN IF NOT EXISTS capture_appointments boolean NOT NULL DEFAULT false;
ALTER TABLE voice_agents ADD COLUMN IF NOT EXISTS capture_orders      boolean NOT NULL DEFAULT false;

-- Unique constraint: one agent per WA number
CREATE UNIQUE INDEX IF NOT EXISTS voice_agents_wa_phone_number_idx
  ON voice_agents(wa_phone_number) WHERE wa_phone_number IS NOT NULL;

-- 2. Migrate wa_conversations → reference voice_agents
ALTER TABLE wa_conversations
  DROP CONSTRAINT IF EXISTS wa_conversations_agent_id_fkey;
DELETE FROM wa_conversations;  -- clear test data (no production data yet)
ALTER TABLE wa_conversations
  ADD CONSTRAINT wa_conversations_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES voice_agents(id) ON DELETE CASCADE;

-- 3. Migrate wa_leads → reference voice_agents
ALTER TABLE wa_leads
  DROP CONSTRAINT IF EXISTS wa_leads_agent_id_fkey;
DELETE FROM wa_leads;
ALTER TABLE wa_leads
  ADD CONSTRAINT wa_leads_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES voice_agents(id) ON DELETE CASCADE;

-- 4. Migrate wa_appointments → reference voice_agents, drop redundant voice_agent_id
ALTER TABLE wa_appointments
  DROP CONSTRAINT IF EXISTS wa_appointments_agent_id_fkey;
DELETE FROM wa_appointments;
ALTER TABLE wa_appointments
  ADD CONSTRAINT wa_appointments_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES voice_agents(id) ON DELETE CASCADE;
ALTER TABLE wa_appointments DROP COLUMN IF EXISTS voice_agent_id;

-- 5. Migrate wa_broadcasts + recipients → reference voice_agents
ALTER TABLE wa_broadcast_recipients DROP CONSTRAINT IF EXISTS wa_broadcast_recipients_broadcast_id_fkey;
DELETE FROM wa_broadcast_recipients;
ALTER TABLE wa_broadcasts
  DROP CONSTRAINT IF EXISTS wa_broadcasts_agent_id_fkey;
DELETE FROM wa_broadcasts;
ALTER TABLE wa_broadcasts
  ADD CONSTRAINT wa_broadcasts_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES voice_agents(id) ON DELETE CASCADE;
ALTER TABLE wa_broadcast_recipients
  ADD CONSTRAINT wa_broadcast_recipients_broadcast_id_fkey
  FOREIGN KEY (broadcast_id) REFERENCES wa_broadcasts(id) ON DELETE CASCADE;

-- 6. whatsapp_agents is now deprecated — no new records should be created there.
--    Keep the table to avoid breaking old references; it can be dropped in a future cleanup.

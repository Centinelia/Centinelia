-- Prevent duplicate outbound_contacts rows when two webhook events fire
-- concurrently for the same caller (race condition in check-then-insert).
-- Run once in Supabase SQL Editor.
ALTER TABLE outbound_contacts
ADD CONSTRAINT outbound_contacts_agent_phone_unique
UNIQUE (agent_id, telefono);

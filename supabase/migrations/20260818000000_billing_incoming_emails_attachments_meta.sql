-- Migration: add attachments_meta column to billing_incoming_emails
-- Required by: loop.ts (C3 fix) -- allows the LLM to know filenames/contentTypes
-- of allowed attachments so it can invoke extract_note_from_image correctly.
--
-- Applied by: controller after Plan A merge.
-- See: handoff / final-fix-report.md "MIGRACION PENDIENTE APLICAR"

ALTER TABLE billing_incoming_emails
  ADD COLUMN IF NOT EXISTS attachments_meta JSONB;

COMMENT ON COLUMN billing_incoming_emails.attachments_meta IS
  'Array of { filename, contentType, size } for each allowed attachment. Populated by /api/billing/inbox.';

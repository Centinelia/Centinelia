-- billing_incoming_emails — dedup por message_id.
--
-- Antes: sin unique. El endpoint /api/billing/inbox (Resend webhook) recibía
-- una vez por correo, entonces no había riesgo de dup. Post-Fase 2 IMAP, el
-- cron /api/cron/agent-mailboxes puede fetch los mismos correos si dos ticks
-- solapan o si markSeen falla después de insert. Sin unique + upsert, cada
-- Message-ID entra N veces y se timbra N veces.
--
-- Partial index para permitir NULL (correos sin Message-ID header — raros
-- pero legales; los tratamos como no-dedupable, aceptable porque el
-- endpoint webhook con secret ya está dedup-safe a nivel HTTP).

CREATE UNIQUE INDEX IF NOT EXISTS billing_incoming_emails_portal_message_uniq
  ON billing_incoming_emails (portal_email, message_id)
  WHERE message_id IS NOT NULL;

COMMENT ON INDEX billing_incoming_emails_portal_message_uniq IS
  'Dedup por (portal_email, message_id) para evitar doble insert desde ticks solapados de agent-mailboxes cron o markSeen fail. Partial: permite NULL para correos sin Message-ID.';

-- Fase de diagnóstico 2026-09-05 (Tortillería Estrella):
-- Los correos SMTP salen (relay 250 OK) pero destinatarios reportan no recibir.
-- Guardamos la respuesta cruda del SMTP relay (accepted/rejected/response) por
-- send para diagnosticar bugs de entregabilidad post-facto sin necesidad de
-- pedir logs de Vercel.
--
-- Solo la puebla el connector `imap_smtp`; Gmail/Outlook siguen dejando NULL
-- (sus SDKs no exponen el response del server con el mismo detalle).

ALTER TABLE outbound_emails
  ADD COLUMN IF NOT EXISTS smtp_response JSONB;

COMMENT ON COLUMN outbound_emails.smtp_response IS
  'Respuesta cruda del SMTP relay: { messageId, response, accepted[], rejected[], envelope }. NULL para Gmail/Outlook/Resend.';

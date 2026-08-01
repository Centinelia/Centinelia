-- Retry queue para processHandoffReply fire-and-forget del webhook.
-- Antes: si el .catch de processHandoffReply fallaba (DB down, storage error,
-- transient network), el correo del humano jamás llegaba al hilo. El humano
-- creía que respondió, el cliente veía escalation ignorada. Silent failure
-- resuelto en audit sesión 53 (ver [[audit-deferred-handoff]] sección F opción A).
--
-- Después: el .catch persiste el payload en esta tabla. Un cron cada 15min
-- retria con exponential backoff (15/30/60/180/720 min). Si tras 5 intentos
-- sigue fallando, marca notified_admin_at y notifica por email a admin
-- centinelia.dev@gmail.com.

BEGIN;

CREATE TABLE IF NOT EXISTS handoff_failed_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_request_id    uuid NOT NULL REFERENCES human_requests(id) ON DELETE CASCADE,
  from_email          text NOT NULL,
  subject             text,
  text_body           text,
  attachments         jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_failed_at     timestamptz NOT NULL DEFAULT NOW(),
  last_attempted_at   timestamptz NOT NULL DEFAULT NOW(),
  last_error          text,
  retry_count         int NOT NULL DEFAULT 0,
  -- NULL = no más retries (dio up o resuelto). NOT NULL + <= NOW() = cron lo toma.
  next_retry_at       timestamptz,
  resolved_at         timestamptz,
  notified_admin_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

-- Cron query: pending + due. Partial index para eficiencia (la mayoría de
-- rows estarán resolved o notified — no queremos scan lineal).
CREATE INDEX IF NOT EXISTS idx_handoff_failed_pending_due
  ON handoff_failed_responses (next_retry_at)
  WHERE resolved_at IS NULL AND next_retry_at IS NOT NULL;

-- Admin UI query: sort by failed_at desc.
CREATE INDEX IF NOT EXISTS idx_handoff_failed_first_failed
  ON handoff_failed_responses (first_failed_at DESC);

COMMIT;

-- Report Intent Locks — sincronización org-level entre meerkats para evitar
-- reportes duplicados al mismo destinatario. Cualquier envío saliente que
-- consume tareas (correo, WhatsApp, monitor alert) reclama primero un intent
-- lock; si otro empleado del mismo portal ya lo reclamó, el segundo abortará
-- sin cobrar op.
--
-- Ver conversación 2026-08-15 con Nazre: "no quedemos mal malgastando las
-- tareas del cliente con info repetida — que se pongan de acuerdo entre ellos".

CREATE TABLE IF NOT EXISTS report_intent_locks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email      text NOT NULL,
  intent_hash       text NOT NULL,
  intent_kind       text NOT NULL,               -- 'email' | 'whatsapp' | 'task' | 'monitor_alert'
  target            text,                        -- destinatario normalizado (email | tel | agent_id)
  subject_summary   text,                        -- para debug/audit
  claimed_by_agent  uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  claimed_by_name   text,                        -- meerkat name (para logs y respuestas)
  claimed_at        timestamptz NOT NULL DEFAULT NOW(),
  committed_at      timestamptz,                 -- se llena cuando el envío efectivo termina
  released_at       timestamptz,                 -- se llena si el envío falla y se libera
  expires_at        timestamptz NOT NULL,        -- TTL del lock si nunca se commitea
  status            text NOT NULL DEFAULT 'claimed', -- 'claimed' | 'committed' | 'released'
  source_context    jsonb,                       -- info opcional: trigger, call_id, message_id
  related_task_id   uuid REFERENCES agent_tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS report_intent_locks_portal_idx
  ON report_intent_locks (portal_email, claimed_at DESC);

CREATE INDEX IF NOT EXISTS report_intent_locks_hash_idx
  ON report_intent_locks (portal_email, intent_hash);

-- Índice auxiliar para el sweep de expirados que hace el helper.
CREATE INDEX IF NOT EXISTS report_intent_locks_expires_idx
  ON report_intent_locks (expires_at) WHERE released_at IS NULL;

-- Partial unique index: garantiza que a nivel org solo puede existir UN lock
-- vivo por intent_hash. El predicate NO puede incluir `expires_at > NOW()`
-- (NOW no es IMMUTABLE en un index predicate → 42P17). En su lugar, el helper
-- barre expirados marcándolos released ANTES de reintentar el INSERT, lo que
-- convierte la ventana TTL en enforcement a nivel aplicación con la
-- atomicidad del unique index cubriendo el resto.
CREATE UNIQUE INDEX IF NOT EXISTS report_intent_locks_live_uidx
  ON report_intent_locks (portal_email, intent_hash)
  WHERE released_at IS NULL;

-- RLS: solo service role puede leer/escribir. Los meerkats operan siempre
-- con el admin client, no con el token del portal.
ALTER TABLE report_intent_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_intent_locks_service_only ON report_intent_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE report_intent_locks IS
  'Locks org-level para deduplicar reportes salientes entre meerkats. '
  'Cualquier tool que envíe correo/WA/notificación reclama un intent lock '
  'antes de consumir ops; si otro empleado ya lo reclamó, el segundo aborta.';

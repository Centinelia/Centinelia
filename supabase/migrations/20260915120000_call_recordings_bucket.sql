-- Storage propio para grabaciones de llamadas Vapi.
--
-- Motivo: Vapi retiene el mp3 en su S3 firmado por tiempo limitado. Cuando
-- expira, los endpoints /api/{admin,portal}/recording/[callId] devuelven 404
-- aunque la fila en voice_calls siga. Cliente pierde acceso al histórico.
--
-- Diseño: bucket privado call-recordings. Al recibir end-of-call-report en
-- /api/voice/webhook, un after() baja el mp3 y lo sube a
--   call-recordings/{agent_id}/{voice_call_id}.mp3
-- Guardamos el path en voice_calls.recording_storage_path (nuevo). El cron
-- /api/cron/backfill-recordings actúa como safety net para casos donde
-- after() se cortó (Vercel 30s) o Vapi aún no tenía el mp3 al momento del
-- webhook — reintenta por 3 días.
--
-- Los endpoints prefieren storage si existe; fallback Vapi para cualquier
-- llamada aún sin migrar dentro de la ventana Vapi.
--
-- Retención: 90 días. Cron /api/cron/cleanup-recordings purga bucket + limpia
-- el path. La columna vieja recording_url (URL Vapi) se sigue limpiando en el
-- mismo cron por consistencia, pero deja de importar operacionalmente porque
-- los endpoints leen del bucket.
--
-- RLS: bucket privado. Solo service role escribe (webhook, backfill cron) y
-- lee para firmar URLs (endpoints /api/{admin,portal}/recording). Cliente
-- NUNCA lee directo — todo va vía createAdminClient() con signed URLs de TTL
-- corto (15 min).

INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY call_recordings_service_read ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'call-recordings');

CREATE POLICY call_recordings_service_write ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'call-recordings');

CREATE POLICY call_recordings_service_update ON storage.objects
  FOR UPDATE TO service_role
  USING (bucket_id = 'call-recordings');

CREATE POLICY call_recordings_service_delete ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'call-recordings');

ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS recording_storage_path TEXT;

COMMENT ON COLUMN voice_calls.recording_storage_path IS
  'Path relativo dentro del bucket call-recordings. Formato: {agent_id}/{voice_call_id}.mp3. NULL cuando el mp3 aún no se ha bajado de Vapi o cuando el cron cleanup ya lo purgó (>90d).';

-- Índice parcial para el query del backfill cron: llamadas con URL de Vapi
-- pero sin path propio aún. Sin el índice, el cron hace scan completo cada
-- 15 min. Índice parcial mantiene el tamaño mínimo (solo filas pendientes).
CREATE INDEX IF NOT EXISTS voice_calls_recording_backfill_idx
  ON voice_calls (created_at)
  WHERE recording_url IS NOT NULL AND recording_storage_path IS NULL;

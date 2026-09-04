-- Auditoría 2026-09-04: guard contra doble timbre en emitir-factura.
-- Bloquea que retry-failed-stamps cron re-tome el mismo requestId mientras
-- otro proceso está en vuelo o acaba de fallar sin completar rollback.

ALTER TABLE factura_requests
  ADD COLUMN IF NOT EXISTS stamp_started_at TIMESTAMPTZ;

COMMENT ON COLUMN factura_requests.stamp_started_at IS
  'Timestamp del último intento de timbre. Si < 5 min y stamp_uuid null, otro proceso está en vuelo — no reintentar.';

CREATE INDEX IF NOT EXISTS idx_factura_requests_stamp_started_at
  ON factura_requests (stamp_started_at)
  WHERE stamp_uuid IS NULL;

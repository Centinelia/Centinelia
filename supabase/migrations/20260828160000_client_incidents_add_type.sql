-- 2026-08-28: Type discriminator para bitácora unificada.
-- 'queja' = flujo actual (cliente reporta problema, callback +3d).
-- 'alta'  = cliente nuevo llama para darse de alta, sin queja. Correo al
-- encargado pidiendo que lo contacte para tomarle el pedido. Sin callback.

ALTER TABLE client_incidents
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'queja'
    CHECK (type IN ('queja', 'alta'));

-- Altas no tienen callback +3d ni motivo obligatorio.
ALTER TABLE client_incidents
  ALTER COLUMN verification_scheduled_at DROP NOT NULL;

ALTER TABLE client_incidents
  ALTER COLUMN motivo DROP NOT NULL;

COMMENT ON COLUMN client_incidents.type IS
  'queja = cliente reporta problema (con callback +3d). alta = alta de nuevo cliente sin queja (sin callback, requiere follow-up humano para tomar pedido).';

CREATE INDEX IF NOT EXISTS idx_client_incidents_portal_type
  ON client_incidents (portal_email, type);

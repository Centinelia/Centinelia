-- Factura requests: solicitudes que Sofia genera cuando cliente pide su factura
-- fiscal. El empleado humano (Martha en AC) captura los datos en Solución Factible
-- o el PAC que use el negocio, timbra, y regresa al portal a marcar como emitida.
--
-- No timbramos desde Centinelia. Somos el puente entre voz/chat/correo y la
-- persona responsable de facturación en el negocio.

CREATE TABLE IF NOT EXISTS factura_requests (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID          NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email    TEXT,         -- redundante para filtros account-wide + siblings lookup

  -- Cliente / receptor de la factura
  cliente_nombre  TEXT          NOT NULL,
  cliente_rfc     TEXT          NOT NULL,
  cliente_email   TEXT          NOT NULL,  -- correo donde llega el CFDI
  cliente_telefono TEXT,                    -- opcional, útil para seguimiento
  cliente_direccion TEXT,                   -- opcional, algunos PAC lo piden

  -- Fiscal
  uso_cfdi        TEXT          NOT NULL,   -- G01, G03, D01, P01, S01, CP01, etc.
  forma_pago      TEXT          NOT NULL,   -- 01 Efectivo / 03 Transferencia / 04 Tarjeta crédito / etc.
  metodo_pago     TEXT          NOT NULL,   -- PUE / PPD
  condiciones_pago TEXT,                     -- free-form ("30 días netos", etc.)

  -- Conceptos
  items           JSONB         NOT NULL DEFAULT '[]'::jsonb,
                                -- [{ descripcion, cantidad, precio_unitario, unidad?, clave_prodserv?, clave_unidad? }]
  subtotal        NUMERIC(12,2) NOT NULL,
  iva             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  currency        TEXT          NOT NULL DEFAULT 'MXN',

  -- Trazabilidad de origen (dónde surgió la solicitud)
  source_channel  TEXT          NOT NULL DEFAULT 'voice',  -- voice | chat | email
  source_call_id  TEXT,          -- vapi call id
  source_inbox_id UUID,          -- email_inbox row id
  source_context  TEXT,          -- transcript excerpt / user message

  -- Estado del ciclo
  status          TEXT          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'in_progress', 'issued', 'cancelled')),
  requested_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,          -- portal_email de quien la marcó (Martha en AC)

  -- Resultado al emitir
  issued_uuid     TEXT,          -- UUID del CFDI que devolvió el PAC (opcional para el récord)
  issued_pdf_path TEXT,          -- path en agent-documents (opcional adjunto)
  issued_xml_path TEXT,          -- path en agent-documents (opcional adjunto)
  issued_folio    TEXT,          -- folio del PAC

  -- Metadata libre
  notes           TEXT,          -- notas internas de Sofia (contexto adicional)
  cancel_reason   TEXT,          -- si Martha cancela

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factura_requests_agent_status
  ON factura_requests (agent_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_factura_requests_portal_email
  ON factura_requests (portal_email, requested_at DESC)
  WHERE portal_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_factura_requests_cliente_rfc
  ON factura_requests (cliente_rfc);

CREATE INDEX IF NOT EXISTS idx_factura_requests_source_call
  ON factura_requests (source_call_id)
  WHERE source_call_id IS NOT NULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION touch_factura_requests_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factura_requests_touch ON factura_requests;
CREATE TRIGGER trg_factura_requests_touch
  BEFORE UPDATE ON factura_requests
  FOR EACH ROW EXECUTE FUNCTION touch_factura_requests_updated_at();

-- Row-level security: solo service role escribe/lee. UI usa admin client.
ALTER TABLE factura_requests ENABLE ROW LEVEL SECURITY;

-- Facturación proactiva de Nala: catálogo de clientes recurrentes de Centinelia
-- + historial event-sourced de emisiones y pagos. Habilita cron nala-billing-cycle
-- para emitir CFDIs al llegar la fecha próxima de facturación sin esperar a que
-- el cliente pida.

-- Helper trigger para mantener updated_at auto (no existía en este proyecto)
CREATE OR REPLACE FUNCTION set_updated_at_now() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--
-- Diseño:
--   - centinelia_clientes: catálogo master, 1 row por cliente. RFC unique.
--   - centinelia_billing: append-only. Cada emisión, pago recibido, REP, cancelación
--     inserta un evento. Idempotencia se checa con unique constraint (cliente_id,
--     tipo, ciclo_key) donde ciclo_key = 'YYYY-MM' para mensual, 'YYYY-Www' para
--     semanal, etc. Impide facturar 2 veces el mismo ciclo si el cron corre 2 veces.
--   - conceptos JSONB: array de items del plan del cliente. Cada uno con { descripcion,
--     valor_unitario, cantidad?, con_iva? }. Se manda tal cual al FacturamaAdapter.

CREATE TABLE IF NOT EXISTS centinelia_clientes (
  id                            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  rfc                           TEXT          NOT NULL UNIQUE,
  razon_social                  TEXT          NOT NULL,
  cp                            TEXT          NOT NULL,
  regimen_fiscal                TEXT          NOT NULL DEFAULT '601',
  uso_cfdi_default              TEXT          NOT NULL DEFAULT 'G03',
  correo_facturacion            TEXT          NOT NULL,
  nombre_contacto               TEXT,
  activo                        BOOLEAN       NOT NULL DEFAULT true,
  -- Plan/conceptos que Nala factura cada ciclo. Array de:
  --   { descripcion: string, valor_unitario: number, cantidad?: number, con_iva?: boolean }
  conceptos                     JSONB         NOT NULL DEFAULT '[]'::jsonb,
  -- Periodicidad de facturación
  periodicidad                  TEXT          NOT NULL DEFAULT 'monthly'
    CHECK (periodicidad IN ('monthly', 'biweekly', 'weekly', 'annual')),
  -- Fecha en la que Nala debe emitir la próxima factura de este cliente
  fecha_proxima_facturacion     DATE          NOT NULL,
  fecha_ultima_facturacion      DATE,
  -- Método/forma pago default (PPD 99 típico; PUE si el cliente ya paga en el acto)
  metodo_pago_default           TEXT          NOT NULL DEFAULT 'PPD'
    CHECK (metodo_pago_default IN ('PUE', 'PPD')),
  forma_pago_default            TEXT          NOT NULL DEFAULT '99',
  -- Integración Stripe (opcional). Cuando exista, cron dispara cobro automático
  -- después de emitir CFDI.
  stripe_customer_id            TEXT,
  -- Metadata libre
  notas                         TEXT,
  created_at                    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_centinelia_clientes_activo_proxima
  ON centinelia_clientes (activo, fecha_proxima_facturacion)
  WHERE activo = true;

CREATE INDEX idx_centinelia_clientes_rfc
  ON centinelia_clientes (rfc);

DROP TRIGGER IF EXISTS trg_centinelia_clientes_updated_at ON centinelia_clientes;
CREATE TRIGGER trg_centinelia_clientes_updated_at
  BEFORE UPDATE ON centinelia_clientes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

-- ─── Historial event-sourced ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS centinelia_billing (
  id                            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id                    UUID          NOT NULL REFERENCES centinelia_clientes(id) ON DELETE RESTRICT,
  tipo                          TEXT          NOT NULL
    CHECK (tipo IN ('cfdi_emitido', 'rep_emitido', 'pago_recibido', 'cancelacion', 'error_emision')),
  -- Ciclo al que pertenece este evento. Formato:
  --   monthly:   'YYYY-MM'    (ej '2026-09')
  --   biweekly:  'YYYY-MM-Q1' o 'YYYY-MM-Q2'
  --   weekly:    'YYYY-Www'   (ej '2026-W36')
  --   annual:    'YYYY'
  -- Se usa para idempotencia — impide facturar el mismo ciclo 2 veces.
  ciclo_key                     TEXT,
  -- CFDI/REP UUIDs (nullable según tipo)
  cfdi_uuid                     TEXT,
  related_uuid                  TEXT,          -- Para REP: UUID del CFDI original
  provider_ref                  TEXT,          -- Facturama internal id
  -- Financials
  monto                         NUMERIC(12,2),
  moneda                        TEXT          DEFAULT 'MXN',
  -- Archivos generados (paths en Supabase Storage bucket 'cfdi')
  xml_path                      TEXT,
  pdf_path                      TEXT,
  qr_path                       TEXT,
  -- Delivery
  sent_to_email                 TEXT,
  sent_at                       TIMESTAMPTZ,
  -- Stripe (para tipo pago_recibido)
  stripe_payment_id             TEXT,
  -- Error info (para tipo error_emision)
  error_code                    INTEGER,
  error_message                 TEXT,
  -- Meta libre
  meta                          JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at                    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Idempotencia: no facturar 2 veces el mismo ciclo para el mismo cliente.
-- El cron nala-billing-cycle verifica antes de emitir.
CREATE UNIQUE INDEX idx_centinelia_billing_ciclo_unico
  ON centinelia_billing (cliente_id, tipo, ciclo_key)
  WHERE ciclo_key IS NOT NULL AND tipo IN ('cfdi_emitido', 'rep_emitido');

CREATE INDEX idx_centinelia_billing_cliente_created
  ON centinelia_billing (cliente_id, created_at DESC);

CREATE INDEX idx_centinelia_billing_cfdi_uuid
  ON centinelia_billing (cfdi_uuid)
  WHERE cfdi_uuid IS NOT NULL;

COMMENT ON TABLE centinelia_clientes IS 'Catálogo de clientes recurrentes de Centinelia. Nala los factura proactivamente en fecha_proxima_facturacion via cron nala-billing-cycle.';
COMMENT ON TABLE centinelia_billing IS 'Historial event-sourced de emisiones/pagos/cancelaciones. Idempotencia por (cliente_id, tipo, ciclo_key). Ver nala-billing-cycle.';

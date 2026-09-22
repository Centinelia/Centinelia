-- Repositorio de facturas por cliente para Neka: extension de centinelia_billing
-- (emitidas por Centinelia) + tabla separada para facturas recibidas (proveedor a
-- Centinelia, gastos deducibles). Los XML+PDF viven en el bucket
-- centinelia-clientes-docs existente; aqui van los metadatos.
--
-- Diseno:
--   - centinelia_billing ya es event-sourced con 'cfdi_emitido' / 'rep_emitido'
--     etc. Le agregamos columnas para el flow del REP: paid_at (cuando Nazre marco
--     "ya me pagaron"), rep_reminder_at (cuando Neka debe recordar), y campos
--     fiscales estructurados (metodo_pago_cfdi, subtotal, iva, uso_cfdi) que hoy
--     estan implicitos en el CFDI XML.
--   - centinelia_facturas_recibidas: tabla nueva chica. El emisor (proveedor) NO
--     esta en centinelia_clientes, se guarda inline (rfc_emisor, razon_social_emisor).
--   - Bucket centinelia-clientes-docs: agregar application/xml + text/xml al
--     allowed_mime_types.

-- 1. Extender centinelia_billing con columnas para el flow REP + fiscales
ALTER TABLE centinelia_billing
  ADD COLUMN IF NOT EXISTS paid_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rep_reminder_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rep_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metodo_pago_cfdi     TEXT,
  ADD COLUMN IF NOT EXISTS subtotal             NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS iva                  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS uso_cfdi             TEXT,
  ADD COLUMN IF NOT EXISTS forma_pago_cfdi      TEXT;

-- CHECK para metodo_pago_cfdi cuando esta seteado
ALTER TABLE centinelia_billing DROP CONSTRAINT IF EXISTS centinelia_billing_metodo_pago_cfdi_check;
ALTER TABLE centinelia_billing
  ADD CONSTRAINT centinelia_billing_metodo_pago_cfdi_check
  CHECK (metodo_pago_cfdi IS NULL OR metodo_pago_cfdi IN ('PUE', 'PPD'));

COMMENT ON COLUMN centinelia_billing.paid_at IS
  'Cuando el usuario marco en el admin que el cliente ya pago el CFDI. Solo aplica a tipo=cfdi_emitido con metodo_pago_cfdi=PPD.';
COMMENT ON COLUMN centinelia_billing.rep_reminder_at IS
  'Fecha en la que el cron neka-rep-reminders debe avisar a Nazre que ya toca emitir REP. Se calcula = paid_at + 5 dias (SAT permite 10 del mes siguiente, buffer 5).';
COMMENT ON COLUMN centinelia_billing.rep_reminder_sent_at IS
  'Cuando el cron ya mando el recordatorio de REP. Impide que se mande dos veces.';

-- Indice: PPDs emitidos pagados que aun no tienen REP asociado
--   ("A quien tengo que emitirle REP y ya me pago")
CREATE INDEX IF NOT EXISTS idx_centinelia_billing_pending_rep
  ON centinelia_billing (cliente_id, paid_at)
  WHERE tipo = 'cfdi_emitido' AND metodo_pago_cfdi = 'PPD' AND paid_at IS NOT NULL;

-- Indice: PPDs emitidos sin marca de pago aun (correo semanal de cobros)
CREATE INDEX IF NOT EXISTS idx_centinelia_billing_unpaid_ppd
  ON centinelia_billing (cliente_id, created_at)
  WHERE tipo = 'cfdi_emitido' AND metodo_pago_cfdi = 'PPD' AND paid_at IS NULL;

-- Indice: REP reminders pendientes de enviar
CREATE INDEX IF NOT EXISTS idx_centinelia_billing_rep_reminder_due
  ON centinelia_billing (rep_reminder_at)
  WHERE tipo = 'cfdi_emitido' AND rep_reminder_at IS NOT NULL AND rep_reminder_sent_at IS NULL;

-- 2. Tabla nueva: facturas recibidas (proveedor a Centinelia, gastos deducibles)
CREATE TABLE IF NOT EXISTS centinelia_facturas_recibidas (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Emisor (proveedor). No vive en centinelia_clientes, se guarda inline.
  rfc_emisor            TEXT          NOT NULL,
  razon_social_emisor   TEXT          NOT NULL,
  regimen_fiscal_emisor TEXT,
  -- Datos del CFDI
  uuid_fiscal           TEXT          UNIQUE,
  serie                 TEXT,
  folio                 TEXT,
  fecha_emision         TIMESTAMPTZ   NOT NULL,
  tipo_comprobante      TEXT          NOT NULL DEFAULT 'I'
    CHECK (tipo_comprobante IN ('I', 'E', 'P', 'N', 'T')),
  uso_cfdi              TEXT,
  metodo_pago           TEXT
    CHECK (metodo_pago IS NULL OR metodo_pago IN ('PUE', 'PPD')),
  forma_pago            TEXT,
  moneda                TEXT          NOT NULL DEFAULT 'MXN',
  subtotal              NUMERIC(12,2) NOT NULL,
  iva                   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12,2) NOT NULL,
  -- Archivos en bucket centinelia-clientes-docs con prefix "recibidas/{id}/..."
  xml_storage_path      TEXT,
  pdf_storage_path      TEXT,
  -- Clasificacion contable
  categoria_gasto       TEXT,
  deducible             BOOLEAN       NOT NULL DEFAULT true,
  notas                 TEXT,
  uploaded_by           TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_fecha
  ON centinelia_facturas_recibidas (fecha_emision DESC);

CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_rfc_emisor
  ON centinelia_facturas_recibidas (rfc_emisor);

CREATE INDEX IF NOT EXISTS idx_facturas_recibidas_deducibles_mes
  ON centinelia_facturas_recibidas (fecha_emision DESC)
  WHERE deducible = true;

DROP TRIGGER IF EXISTS trg_centinelia_facturas_recibidas_updated_at ON centinelia_facturas_recibidas;
CREATE TRIGGER trg_centinelia_facturas_recibidas_updated_at
  BEFORE UPDATE ON centinelia_facturas_recibidas
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_now();

COMMENT ON TABLE centinelia_facturas_recibidas IS
  'CFDIs que proveedores emiten a Centinelia (gastos). Repositorio separado de centinelia_billing porque el emisor no esta en centinelia_clientes. Archivos viven en bucket centinelia-clientes-docs con prefix "recibidas/{id}/".';

-- 3. Extender el bucket centinelia-clientes-docs para aceptar XML de CFDIs
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/xml',
  'text/xml'
]
WHERE id = 'centinelia-clientes-docs';

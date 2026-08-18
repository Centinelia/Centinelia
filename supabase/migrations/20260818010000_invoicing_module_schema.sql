-- =============================================================================
-- Migration: 20260818010000_invoicing_module_schema.sql
-- Module:    PAC Timbrado / Facturación (Solucion Factible integration)
--
-- NOTA IMPORTANTE: Esta migración DOCUMENTA schema ya aplicado directamente
-- en el dashboard de Supabase entre julio–agosto 2026. NO introduce cambios
-- de comportamiento. Propósito: reproducibilidad de entornos (staging, reset).
--
-- Toda instrucción usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS para ser
-- idempotente — aplicar en un entorno ya actualizado es un no-op seguro.
--
-- Aplicada originalmente vía Supabase dashboard, versionada aquí el 2026-08-18.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECCIÓN 1: Columnas invoicing_* en tabla organizations
-- 14 columnas que extienden organizations con datos del emisor PAC.
-- -----------------------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS invoicing_provider                  TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_credentials_encrypted     TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_csd_cer_path              TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_csd_key_path              TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_csd_password_encrypted    TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_csd_version               INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoicing_csd_expires_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoicing_csd_no_certificado        TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_rfc_emisor                TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_razon_social              TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_regimen_fiscal            TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_lugar_expedicion          TEXT,
  ADD COLUMN IF NOT EXISTS invoicing_test_mode                 BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoicing_allow_agent_cancellation  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoicing_limits                    JSONB DEFAULT '{"monto_max_mxn": 50000, "blocked_uso_cfdi": ["D01","D02","D03","D04","D05","D06","D07","D08","D09","D10"], "max_stamps_per_day": 50, "max_stamps_per_hour_per_rfc": 3}'::jsonb;


-- -----------------------------------------------------------------------------
-- SECCIÓN 2: Tabla factura_requests
-- Registro de solicitudes de CFDI — creadas por voz/chat/email/portal.
-- RLS: ENABLED (service_role bypasses; no policies definidas en esta migración).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS factura_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID        NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email          TEXT,
  cliente_nombre        TEXT        NOT NULL,
  cliente_rfc           TEXT        NOT NULL,
  cliente_email         TEXT        NOT NULL,
  cliente_telefono      TEXT,
  cliente_direccion     TEXT,
  uso_cfdi              TEXT        NOT NULL,
  forma_pago            TEXT        NOT NULL,
  metodo_pago           TEXT        NOT NULL,
  condiciones_pago      TEXT,
  items                 JSONB       NOT NULL DEFAULT '[]'::jsonb,
  subtotal              NUMERIC     NOT NULL,
  iva                   NUMERIC     NOT NULL DEFAULT 0,
  total                 NUMERIC     NOT NULL,
  currency              TEXT        NOT NULL DEFAULT 'MXN',
  source_channel        TEXT        NOT NULL DEFAULT 'voice',
  source_call_id        TEXT,
  source_inbox_id       UUID,
  source_context        TEXT,
  status                TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','in_progress','issued','cancelled')),
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ,
  resolved_by           TEXT,
  issued_uuid           TEXT,
  issued_pdf_path       TEXT,
  issued_xml_path       TEXT,
  issued_folio          TEXT,
  notes                 TEXT,
  cancel_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Columnas post-timbrado (agregadas después del lanzamiento inicial)
  uuid                  TEXT,
  sello_sat             TEXT,
  certificado_sat       TEXT,
  fecha_timbrado        TIMESTAMPTZ,
  cadena_original       TEXT,
  xml_storage_path      TEXT,
  pdf_storage_path      TEXT,
  qr_storage_path       TEXT,
  stamp_attempts        INTEGER     DEFAULT 0,
  stamp_last_error      TEXT,
  stamp_last_error_at   TIMESTAMPTZ,
  provider              TEXT,
  guardrail_reason      TEXT
);

-- NOTA: El CHECK constraint en `status` también cubre estados de flujo de timbrado
-- ('stamping', 'stamp_failed', 'cancellation_requested') que aparecen en índices
-- parciales de producción. Si el CHECK en prod ya incluye esos valores, este
-- CREATE TABLE IF NOT EXISTS es un no-op y el constraint existente prevalece.
-- Verificar con: \d factura_requests en psql antes de aplicar en staging.

-- Índices de factura_requests
CREATE INDEX IF NOT EXISTS idx_factura_requests_agent_status
  ON factura_requests(agent_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_factura_requests_portal_email
  ON factura_requests(portal_email, requested_at DESC)
  WHERE portal_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_factura_requests_cliente_rfc
  ON factura_requests(cliente_rfc);

CREATE INDEX IF NOT EXISTS idx_factura_requests_source_call
  ON factura_requests(source_call_id)
  WHERE source_call_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS factura_requests_uuid_unique
  ON factura_requests(uuid)
  WHERE uuid IS NOT NULL;

-- Índice parcial para estados de timbrado en vuelo (incluye valores fuera del CHECK
-- original; si el índice ya existe en prod con esta definición, es un no-op)
CREATE INDEX IF NOT EXISTS factura_requests_stamping_status
  ON factura_requests(status)
  WHERE status = ANY (ARRAY['stamping'::text, 'stamp_failed'::text, 'cancellation_requested'::text]);

-- RLS: habilitado en prod. Se habilita aquí para reproducibilidad.
-- Policies: no hay policies definidas — acceso solo vía service_role.
ALTER TABLE factura_requests ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at — reutiliza set_updated_at() definida en 20260804_sheets_mappings.sql
DROP TRIGGER IF EXISTS factura_requests_updated_at ON factura_requests;
CREATE TRIGGER factura_requests_updated_at
  BEFORE UPDATE ON factura_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- SECCIÓN 3: Tabla cfdi_cancellations
-- Registro de solicitudes de cancelación de CFDI ante el SAT.
-- RLS: DISABLED en prod — ver deuda de seguridad al final de este archivo.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cfdi_cancellations (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_request_id        UUID        REFERENCES factura_requests(id) ON DELETE RESTRICT,
  organization_email        TEXT        NOT NULL,
  uuid_cancelado            TEXT        NOT NULL,
  motivo                    TEXT        NOT NULL
                              CHECK (motivo IN ('01','02','03','04')),
  uuid_sustituto            TEXT,
  requested_by              TEXT,
  requested_by_agent_id     UUID,
  requested_via             TEXT
                              CHECK (requested_via IN ('voice','chat','email','portal')),
  status                    TEXT        NOT NULL DEFAULT 'requested'
                              CHECK (status IN ('requested','sent_to_sat','accepted','rejected','expired')),
  sat_status_last_check     TIMESTAMPTZ,
  sat_acuse_xml_path        TEXT,
  razon_cliente             TEXT,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Motivo 01 (sustitución) requiere uuid_sustituto
  CONSTRAINT sustituto_requerido CHECK (motivo != '01' OR uuid_sustituto IS NOT NULL)
);

-- Índices de cfdi_cancellations
CREATE INDEX IF NOT EXISTS cfdi_cancellations_org_status
  ON cfdi_cancellations(organization_email, status);

CREATE INDEX IF NOT EXISTS cfdi_cancellations_poll
  ON cfdi_cancellations(status, sat_status_last_check)
  WHERE status = 'sent_to_sat';

-- RLS: NO habilitar aquí — cfdi_cancellations tiene RLS DISABLED en prod.
-- Habilitarlo es un cambio de comportamiento que requiere plan aparte.
-- Ver sección "Deuda de seguridad" al final de este archivo.

-- Trigger updated_at
DROP TRIGGER IF EXISTS cfdi_cancellations_updated_at ON cfdi_cancellations;
CREATE TRIGGER cfdi_cancellations_updated_at
  BEFORE UPDATE ON cfdi_cancellations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- SECCIÓN 4: Storage buckets
-- Buckets privados para CSD (certificados) y CFDI (XML/PDF/QR).
-- Acceso: solo service_role (sin policies — acceso directo desde backend).
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
  VALUES ('csd', 'csd', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('cfdi', 'cfdi', false)
  ON CONFLICT (id) DO NOTHING;

-- NOTA: No hay storage policies extraídas de prod. El backend usa service_role
-- key para leer/escribir en ambos buckets. Si se añaden policies en el futuro,
-- crear una migración separada.


-- =============================================================================
-- DEUDA DE SEGURIDAD (no aplica en esta migración, requiere plan aparte)
-- =============================================================================
--
-- cfdi_cancellations tiene RLS DISABLED en producción.
-- Esta tabla contiene datos sensibles (UUIDs CFDI, motivos de cancelación, RFC).
-- Para habilitarlo se requiere:
--   1. Auditar todo código que lee/escribe cfdi_cancellations (service_role vs anon).
--   2. Diseñar policies que cubran los accesos legítimos existentes.
--   3. Probar en staging antes de habilitar en prod.
--   4. Crear migración separada: ALTER TABLE cfdi_cancellations ENABLE ROW LEVEL SECURITY;
--      + policies correspondientes.
--
-- Tracking: issue abierto en audit_backlog.
-- =============================================================================

-- =============================================================================
-- Migration: 20260818030000_expedientes_compras.sql
-- Module:    Ciclo OC-CFDI (pack `ciclo_oc_cfdi`)
--
-- State machine para el ciclo completo compra-a-proveedor + facturación-a-cliente
-- que usan constructoras / comercializadoras / PYMEs industriales:
--
--   oc_creada → oc_firmada → oc_pagada → oc_enviada_proveedor
--     → mercancia_recibida → factura_timbrada → docs_archivados
--
-- Flujo alterno (arranca con factura primero):
--   factura_timbrada → (OCs paralelas) → docs_archivados
--
-- Aplicable a cualquier org con QuickBooks + PAC conectados. Piloto AC Proyectos.
-- Ver [[handoff-ac-proyectos-ciclo-oc-cfdi]] + [[project-solucion-factible-integration]].
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECCIÓN 1: Config del ciclo OC-CFDI en organizations
-- Añade JSONB de config + path de imagen de firma digitalizada.
-- -----------------------------------------------------------------------------

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ciclo_oc_config       JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ciclo_oc_firma_path   TEXT;

-- Shape esperado de ciclo_oc_config:
-- {
--   "monto_max_autofirma_mxn":         50000,        // tope de autofirma
--   "sanidad_no_duplicados_horas":     48,           // ventana para detectar OC duplicada
--   "archivado_nomenclatura":          "{año}/{mes}/{proveedor}/{folio}_{fecha}.pdf",
--   "archivado_destino":               "dropbox" | "smb_local" | "windows_agent",
--   "archivado_root":                  "\\\\SERVIDOR\\facturas" o "/Facturación/"
-- }


-- -----------------------------------------------------------------------------
-- SECCIÓN 2: Tabla expedientes_compras
-- Un row = una operación completa OC-CFDI (proveedor + cliente).
-- RLS: ENABLED (acceso solo vía service_role, patrón del proyecto).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expedientes_compras (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email                  TEXT        NOT NULL,
  agent_id                      UUID        REFERENCES voice_agents(id) ON DELETE SET NULL,

  -- Identificación operativa
  folio_interno                 TEXT,
  descripcion                   TEXT,

  -- QB — Orden de Compra al proveedor
  qb_po_id                      TEXT,
  qb_po_folio                   TEXT,
  proveedor_nombre              TEXT,
  proveedor_rfc                 TEXT,
  proveedor_email               TEXT,
  oc_monto_mxn                  NUMERIC(14,2),
  oc_moneda                     TEXT        DEFAULT 'MXN',
  oc_conceptos                  JSONB,
  oc_pdf_path                   TEXT,
  oc_pdf_firmado_path           TEXT,

  -- Firma
  oc_firmada_por                TEXT,
  oc_firmada_at                 TIMESTAMPTZ,
  oc_firma_reglas_pasadas       JSONB,
  oc_firma_es_auto              BOOLEAN     DEFAULT false,

  -- Pago al proveedor
  oc_pagada_at                  TIMESTAMPTZ,
  oc_comprobante_pago_path      TEXT,

  -- Envío al proveedor (paso 9)
  oc_enviada_proveedor_at       TIMESTAMPTZ,
  oc_enviada_email_message_id   TEXT,

  -- Recepción mercancía
  mercancia_recibida_at         TIMESTAMPTZ,
  mercancia_notas               TEXT,

  -- SF — CFDI al cliente
  sf_uuid                       TEXT,
  sf_folio                      TEXT,
  cliente_nombre                TEXT,
  cliente_rfc                   TEXT,
  cliente_email                 TEXT,
  cfdi_monto_mxn                NUMERIC(14,2),
  cfdi_uso                      TEXT,
  cfdi_forma_pago               TEXT,
  cfdi_metodo_pago              TEXT,
  cfdi_xml_path                 TEXT,
  cfdi_pdf_path                 TEXT,
  cfdi_acuse_path               TEXT,
  cfdi_timbrada_at              TIMESTAMPTZ,
  factura_request_id            UUID        REFERENCES factura_requests(id) ON DELETE SET NULL,

  -- Archivado local (Windows agent .NET 8 / Dropbox / SMB)
  docs_archivados_at            TIMESTAMPTZ,
  docs_archivados_ruta          TEXT,

  -- Estado
  status                        TEXT        NOT NULL DEFAULT 'oc_creada'
    CHECK (status IN (
      'oc_creada',
      'oc_firmada',
      'oc_pagada',
      'oc_enviada_proveedor',
      'mercancia_recibida',
      'factura_timbrada',
      'docs_archivados',
      'cancelado',
      'requiere_atencion'
    )),

  -- Si arranca con timbrado primero (flujo alterno confirmado por AC 2026-08-18)
  flujo_invertido               BOOLEAN     NOT NULL DEFAULT false,

  -- Escalación humana
  requiere_atencion_razon       TEXT,
  requiere_atencion_at          TIMESTAMPTZ,

  -- Cancelación
  cancelado_at                  TIMESTAMPTZ,
  cancelado_razon               TEXT,

  -- Timestamps
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Consistencia fiscal: monto CFDI debe empatar monto OC (sin markup, per AC)
  -- Solo se valida cuando ambos existen; permite pequeño round-off por IVA.
  CONSTRAINT montos_coherentes CHECK (
    oc_monto_mxn IS NULL OR cfdi_monto_mxn IS NULL
      OR ABS(oc_monto_mxn - cfdi_monto_mxn) <= 0.02
  )
);

-- Índices
CREATE INDEX IF NOT EXISTS expedientes_compras_portal_status
  ON expedientes_compras(portal_email, status, created_at DESC);

CREATE INDEX IF NOT EXISTS expedientes_compras_qb_po
  ON expedientes_compras(qb_po_id)
  WHERE qb_po_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS expedientes_compras_sf_uuid
  ON expedientes_compras(sf_uuid)
  WHERE sf_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS expedientes_compras_folio
  ON expedientes_compras(portal_email, folio_interno)
  WHERE folio_interno IS NOT NULL;

CREATE INDEX IF NOT EXISTS expedientes_compras_proveedor_rfc
  ON expedientes_compras(portal_email, proveedor_rfc, created_at DESC)
  WHERE proveedor_rfc IS NOT NULL;

-- Únicos: previene doble-alta accidental por reintentos del meerkat
CREATE UNIQUE INDEX IF NOT EXISTS expedientes_compras_qb_po_unique
  ON expedientes_compras(qb_po_id)
  WHERE qb_po_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expedientes_compras_sf_uuid_unique
  ON expedientes_compras(sf_uuid)
  WHERE sf_uuid IS NOT NULL;

-- RLS: enabled, service_role bypasses (patrón del proyecto)
ALTER TABLE expedientes_compras ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at — reutiliza set_updated_at() de 20260804_sheets_mappings.sql
DROP TRIGGER IF EXISTS expedientes_compras_updated_at ON expedientes_compras;
CREATE TRIGGER expedientes_compras_updated_at
  BEFORE UPDATE ON expedientes_compras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- SECCIÓN 3: Tabla expediente_eventos (audit trail de transiciones)
-- Un row = una transición o acción sobre un expediente. Sirve para debug +
-- audit fiscal + reconstrucción del historial completo.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS expediente_eventos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id     UUID        NOT NULL REFERENCES expedientes_compras(id) ON DELETE CASCADE,
  portal_email      TEXT        NOT NULL,
  agent_id          UUID        REFERENCES voice_agents(id) ON DELETE SET NULL,
  actor             TEXT,       -- 'meerkat:nala' | 'meerkat:nox' | 'humano:tania@acproyectos.com'
  tipo              TEXT        NOT NULL
    CHECK (tipo IN (
      'oc_creada','oc_firmada_auto','oc_firmada_humano',
      'oc_pagada','oc_enviada_proveedor',
      'mercancia_recibida','factura_timbrada','docs_archivados',
      'cancelado','requiere_atencion',
      'nota','error'
    )),
  from_status       TEXT,
  to_status         TEXT,
  detalle           JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expediente_eventos_expediente
  ON expediente_eventos(expediente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS expediente_eventos_portal
  ON expediente_eventos(portal_email, created_at DESC);

ALTER TABLE expediente_eventos ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- NOTAS DE DISEÑO
-- =============================================================================
--
-- 1. NO se agrega FK a organizations(portal_email) porque el patrón del proyecto
--    permite portal_email en voice_agents sin FK — se valida a nivel aplicación.
--    Ver factura_requests para el mismo patrón.
--
-- 2. montos_coherentes: AC confirmó 2026-08-18 que se copia OC → CFDI tal cual,
--    sin markup. El CHECK previene errores de captura o meerkat alucinando
--    montos. Tolerancia de 0.02 MXN por posible round-off al calcular IVA.
--    Si en el futuro un cliente requiere markup, hacer nueva migración que
--    RELAX el constraint o lo mueva a lógica de aplicación.
--
-- 3. Storage buckets — los PDFs de OC firmada, comprobantes de pago y CFDIs
--    reutilizan el bucket 'cfdi' existente. No se crea bucket nuevo.
--
-- 4. RLS enabled con acceso solo service_role — mismo patrón que factura_requests.
--    Todo endpoint que lea/escriba debe usar createAdminClient().
-- =============================================================================

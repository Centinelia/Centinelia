-- billing_shared_layer: tablas base para el empleado digital de facturacion.
-- Accedidas exclusivamente via service_role (createAdminClient).
-- RLS habilitado sin politicas publicas — el service_role bypasa RLS por defecto.
--
-- Nota arquitectural: organizations usa portal_email TEXT como PK (no UUID).
-- Todas las FKs a organizations usan portal_email, siguiendo el patron del codebase
-- (ver sheets_mappings, ops_ledger, etc).

-- -----------------------------------------------------------------------------
-- 1. organization_integrations
--    Registro de integraciones de facturacion a nivel org.
--    Una org puede tener multiples integraciones de tipos distintos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_integrations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email   TEXT        NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  type           TEXT        NOT NULL,   -- 'solucion_factible' | 'contpaqi' | 'aspel' | ...
  config         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_email, type)
);

CREATE INDEX IF NOT EXISTS organization_integrations_portal_idx
  ON organization_integrations (portal_email);

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_integrations_service_only ON organization_integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. billing_client_rules
--    Reglas de facturacion por cliente (sparse — solo overrides al default).
--    FK a organization_integrations para vincular al adaptador correcto.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_client_rules (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email           TEXT        NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  integration_id         UUID        NOT NULL REFERENCES organization_integrations(id) ON DELETE CASCADE,
  rfc                    TEXT        NOT NULL,
  adapter_client_id      TEXT,
  frequency              TEXT        NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  cut_day                TEXT,
  default_payment_method TEXT        CHECK (default_payment_method IN ('efectivo', 'transferencia', 'cheque', 'tarjeta') OR default_payment_method IS NULL),
  aliases                TEXT[]      NOT NULL DEFAULT '{}',
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integration_id, rfc)
);

CREATE INDEX IF NOT EXISTS billing_client_rules_portal_idx
  ON billing_client_rules (portal_email);

CREATE INDEX IF NOT EXISTS billing_client_rules_integration_idx
  ON billing_client_rules (integration_id);

ALTER TABLE billing_client_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_client_rules_service_only ON billing_client_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION billing_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS billing_client_rules_updated_at ON billing_client_rules;
CREATE TRIGGER billing_client_rules_updated_at
  BEFORE UPDATE ON billing_client_rules
  FOR EACH ROW EXECUTE FUNCTION billing_update_timestamp();

DROP TRIGGER IF EXISTS organization_integrations_updated_at ON organization_integrations;
CREATE TRIGGER organization_integrations_updated_at
  BEFORE UPDATE ON organization_integrations
  FOR EACH ROW EXECUTE FUNCTION billing_update_timestamp();

-- -----------------------------------------------------------------------------
-- 3. billing_product_aliases
--    Alias aprendidos: texto libre -> SKU del adaptador.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_product_aliases (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email    TEXT        NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  integration_id  UUID        NOT NULL REFERENCES organization_integrations(id) ON DELETE CASCADE,
  alias_text      TEXT        NOT NULL,
  adapter_sku     TEXT        NOT NULL,
  learned_from    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (integration_id, alias_text)
);

CREATE INDEX IF NOT EXISTS billing_product_aliases_portal_idx
  ON billing_product_aliases (portal_email);

CREATE INDEX IF NOT EXISTS billing_product_aliases_integration_idx
  ON billing_product_aliases (integration_id);

ALTER TABLE billing_product_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_product_aliases_service_only ON billing_product_aliases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. billing_activity_log
--    Auditoria de acciones del empleado digital de facturacion.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_activity_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email    TEXT        NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  integration_id  UUID        REFERENCES organization_integrations(id) ON DELETE SET NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_type     TEXT        NOT NULL,
  severity        TEXT        NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  entity_ref      TEXT,
  context         JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS billing_activity_log_portal_time_idx
  ON billing_activity_log (portal_email, timestamp DESC);

CREATE INDEX IF NOT EXISTS billing_activity_log_integration_time_idx
  ON billing_activity_log (integration_id, timestamp DESC)
  WHERE integration_id IS NOT NULL;

ALTER TABLE billing_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_activity_log_service_only ON billing_activity_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE organization_integrations IS
  'Integraciones de facturacion a nivel org (solucion_factible, contpaqi, aspel, etc). '
  'Accedida exclusivamente via service_role. Una org puede tener multiples integraciones.';

COMMENT ON TABLE billing_client_rules IS
  'Reglas de facturacion por cliente RFC. Sparse: solo overrides al comportamiento default. '
  'El empleado digital las consulta antes de emitir una factura.';

COMMENT ON TABLE billing_product_aliases IS
  'Mapeo texto-libre -> SKU del adaptador. El empleado digital los aprende de conversaciones '
  'y los usa para identificar productos automaticamente.';

COMMENT ON TABLE billing_activity_log IS
  'Auditoria de acciones del empleado digital: intentos de timbrado, errores, escalaciones. '
  'Append-only — nunca se borra un registro.';

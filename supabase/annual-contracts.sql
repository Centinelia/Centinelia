-- annual_contracts + billing_model dual: soporta clientes con contrato anual
-- prepagado (gobierno/enterprise) coexistiendo con clientes Stripe mensuales.
--
-- Modelo:
--   - organizations.billing_model = 'stripe'         → minutos por agente (comportamiento actual)
--   - organizations.billing_model = 'annual_prepaid' → pool compartido a nivel org
--
-- El contrato es historial: una fila POR CADA año contratado. Solo puede haber
-- 1 fila con status='active' por organización a la vez (garantía con partial UX).
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS annual_contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_email   text NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  contract_folio       text NOT NULL,                          -- CTR-2026-0001 (correlativo manual)
  status               text NOT NULL DEFAULT 'draft',          -- draft | active | expired | cancelled
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  amount_mxn           numeric(12,2) NOT NULL,                 -- 180000.00 IVA incluido? (aclarar)
  monthly_minutes_pool int NOT NULL,                           -- 12000 minutos por mes
  monthly_ops_pool     int NOT NULL,                           -- 500 ops por mes
  included_employees   int,                                    -- 3 (informativo, no hard limit)
  invoice_folio        text,                                   -- CFDI emitido: A-4523
  invoice_pdf_url      text,                                   -- URL a Supabase Storage o S3
  payment_received_at  timestamptz,                            -- cuando entró el SPEI
  notes                text,                                   -- notas internas de Nazre
  created_by           text,                                   -- admin email que lo creó
  created_at           timestamptz NOT NULL DEFAULT now(),
  cancelled_at         timestamptz,
  cancelled_reason     text,
  CONSTRAINT annual_contracts_status_check
    CHECK (status IN ('draft', 'active', 'expired', 'cancelled')),
  CONSTRAINT annual_contracts_dates_check
    CHECK (end_date > start_date)
);

ALTER TABLE annual_contracts ENABLE ROW LEVEL SECURITY;

-- Solo UN contrato active por organización a la vez (draft/expired/cancelled sí pueden coexistir)
CREATE UNIQUE INDEX IF NOT EXISTS ux_annual_contracts_active_per_org
  ON annual_contracts(organization_email)
  WHERE status = 'active';

-- Búsquedas por folio (único negocio, aunque no es PK)
CREATE UNIQUE INDEX IF NOT EXISTS ux_annual_contracts_folio
  ON annual_contracts(contract_folio);

-- Búsqueda de contratos próximos a expirar (cron flags-promote-style)
CREATE INDEX IF NOT EXISTS idx_annual_contracts_end_date
  ON annual_contracts(end_date)
  WHERE status = 'active';

-- ── organizations: soporte dual billing_model + pool compartido ────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_model        text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS active_contract_id   uuid REFERENCES annual_contracts(id),
  ADD COLUMN IF NOT EXISTS monthly_minutes_used int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_ops_used     int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pool_reset_date      date;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_billing_model_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_billing_model_check
  CHECK (billing_model IN ('stripe', 'annual_prepaid', 'expired'));

-- Overage tracking (empleados nunca paran; overage se cobra en renovación)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS overage_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_ops     int NOT NULL DEFAULT 0;

-- Idempotencia de recordatorios de renovación (cron annual-contracts-lifecycle)
ALTER TABLE annual_contracts
  ADD COLUMN IF NOT EXISTS renewal_reminder_60d_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_reminder_15d_sent boolean NOT NULL DEFAULT false;

-- Consistencia: si billing_model='annual_prepaid' debe tener active_contract_id
-- (soft-enforced via trigger para no bloquear updates transaccionales)

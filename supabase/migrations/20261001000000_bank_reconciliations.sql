-- F2 Conciliación bancaria para Nalú.
-- Spec propuesta en chat 2026-10-01: match extracto bancario (CSV/XLSX) contra
-- CFDIs emitidos pendientes (centinelia_billing). Motor en src/lib/bank/.
--
-- Tabla backend-only (RLS enabled sin policies abiertas = acceso solo via
-- service role, consistente con email_send_jobs y otras tablas de workers).

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant + agente que procesó
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id        uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  processed_by    text NOT NULL,  -- 'nalu' | portal_email del usuario humano | 'system'

  -- Fuente
  bank_slug             text NOT NULL CHECK (bank_slug IN ('bbva', 'banorte')),
  statement_period_start date NOT NULL,
  statement_period_end   date NOT NULL,
  source_file_path       text NOT NULL,  -- storage path del CSV/XLSX original
  result_file_path       text,            -- storage path del Excel 3 hojas devuelto

  -- Resumen cuantitativo (para listados en UI sin tener que leer `matches`)
  txns_total     int NOT NULL,
  txns_matched   int NOT NULL,
  txns_review    int NOT NULL,
  txns_unmatched int NOT NULL,

  -- Detalle: [{txn_source_row, txn_description, txn_amount, cfdi_uuid, score, status, reason}, ...]
  matches jsonb NOT NULL,

  -- Contabilidad
  ops_charged int NOT NULL DEFAULT 1,  -- 1 op por batch (feedback-batched-consume-multi-io)
  ledger_reference_id text,            -- UUID del row en ai_ops_log para traceo

  processed_at timestamptz NOT NULL DEFAULT NOW(),
  created_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_rec_org
  ON bank_reconciliations (organization_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_rec_agent
  ON bank_reconciliations (agent_id, processed_at DESC)
  WHERE agent_id IS NOT NULL;

-- RLS obligatoria (feedback_rls_public_tables_default). Sin policies abiertas:
-- acceso backend-only vía service role, como email_send_jobs.
ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE bank_reconciliations IS
  'Batches de conciliación bancaria procesados por Nalú. 1 row por archivo subido. matches[] contiene el detalle txn↔CFDI con score. Backend-only via service role. Ver src/lib/bank/.';

-- Feature flag per-org (rollout gradual: Tortillería primero, pilotos, global)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS bank_reconciliation_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.bank_reconciliation_enabled IS
  'Activa la tool conciliar_estado_cuenta en Nalú (chat + email, voz no aplica por adjunto). Default false; roll Tortillería → pilotos → global cuando el motor esté validado contra CSV real.';

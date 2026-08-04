-- expense_approvals — registro de aprobaciones de gasto que autoriza el
-- coordinador (Niva por default). Cada aprobación queda con audit trail:
-- quién aprobó, concepto, monto, justificación, timestamp.
--
-- Uso: la tool `aprobar_gasto` (exclusiva de Niva) inserta aquí cuando la
-- directora general da luz verde a un gasto propuesto por el equipo.

CREATE TABLE IF NOT EXISTS expense_approvals (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email   text        NOT NULL,
  approved_by    uuid        NOT NULL REFERENCES voice_agents(id) ON DELETE SET NULL,
  concept        text        NOT NULL,
  amount_mxn     numeric(12, 2) NOT NULL,
  justification  text,
  status         text        NOT NULL DEFAULT 'approved'
                             CHECK (status IN ('approved', 'rejected', 'pending')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_approvals_portal_idx
  ON expense_approvals (portal_email, created_at DESC);

ALTER TABLE expense_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON expense_approvals
  USING (false)
  WITH CHECK (false);

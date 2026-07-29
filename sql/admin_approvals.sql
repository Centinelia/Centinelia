-- C3 — Admin gate para acciones destructivas / de gasto
-- Se aplica una vez en Supabase antes de usar el gate.

CREATE TABLE IF NOT EXISTS admin_approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text NOT NULL,                  -- 'grant_ops' | 'refund' | 'cancel_agent' | 'plan_change' | ...
  title          text NOT NULL,
  rationale      text,                            -- por qué se pide
  requested_by   text NOT NULL DEFAULT 'admin',   -- actor que solicitó (más adelante sub-users)
  amount         numeric,                         -- monto o cantidad relevante
  target_id      text,                            -- id del recurso afectado (voice_agent.id, etc)
  target_email   text,                            -- portal_email si aplica
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb, -- inputs originales de la acción
  checks         jsonb NOT NULL DEFAULT '[]'::jsonb, -- policy checks al momento del request
  status         text NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  decided_at     timestamptz,
  decided_by     text,
  decision_note  text,
  executed_at    timestamptz,                      -- cuando la acción realmente corrió
  execution_result jsonb                           -- salida de la acción ejecutada
);

CREATE INDEX IF NOT EXISTS admin_approvals_status_idx     ON admin_approvals(status);
CREATE INDEX IF NOT EXISTS admin_approvals_type_idx       ON admin_approvals(type);
CREATE INDEX IF NOT EXISTS admin_approvals_created_at_idx ON admin_approvals(created_at DESC);

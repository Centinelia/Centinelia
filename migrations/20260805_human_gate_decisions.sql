-- Graph engineering (human gates): auditoría unificada de decisiones humanas.
-- Cada vez que un usuario aprueba, rechaza o edita algo, escribimos una fila
-- aquí. Los endpoints existentes (approve-plan, edit-plan, reject, ops/approve,
-- etc.) siguen funcionando igual — solo agregamos un log paralelo para tener
-- vista unificada en /admin/human-gates.

CREATE TABLE IF NOT EXISTS human_gate_decisions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_type          TEXT NOT NULL,         -- 'agent_task_plan', 'ops_inbox', 'contract_send', 'expense', etc.
  resource_id        TEXT NOT NULL,         -- id de la entidad (agent_tasks.id, ops_inbox.id, etc.)
  decision           TEXT NOT NULL,         -- 'approve', 'reject', 'edit', 'send', 'cancel'
  actor              TEXT NOT NULL,         -- 'user', 'user:<email>', 'admin', etc.
  actor_identifier   TEXT,                  -- portal_email del que decidió, si aplica
  channel            TEXT NOT NULL,         -- 'email_magic_link', 'portal_ui', 'admin_ui', 'chat'
  reason             TEXT,                  -- humano-legible
  metadata           JSONB,                 -- payload extra (edits, notas, tokens usados, etc.)
  portal_email       TEXT,                  -- para agrupar por org
  decided_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS human_gate_decisions_resource_idx ON human_gate_decisions (gate_type, resource_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS human_gate_decisions_actor_idx    ON human_gate_decisions (actor, decided_at DESC);
CREATE INDEX IF NOT EXISTS human_gate_decisions_portal_idx   ON human_gate_decisions (portal_email, decided_at DESC);
CREATE INDEX IF NOT EXISTS human_gate_decisions_time_idx     ON human_gate_decisions (decided_at DESC);
CREATE INDEX IF NOT EXISTS human_gate_decisions_type_idx     ON human_gate_decisions (gate_type, decided_at DESC);

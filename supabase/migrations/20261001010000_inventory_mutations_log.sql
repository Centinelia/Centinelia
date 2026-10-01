-- Audit log de mutaciones al Excel de inventario (AC Proyectos piloto Mes 1
-- y futuras orgs con pack inventory_excel). Permite rollback por script sin
-- re-ejecutar prompts, y vista "actividad de Nami" en el portal futura.
--
-- Precedente: spec docs/superpowers/specs/2026-10-01-nami-fase1-inventory-writers-design.md

CREATE TABLE inventory_mutations_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email       text NOT NULL,
  agent_id           uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  tool_name          text NOT NULL,
  serie              text,
  table_row_index    int,
  before_state       jsonb,
  after_state        jsonb NOT NULL,
  patched_columns    text[],
  metadata           jsonb,
  ops_charged        int NOT NULL DEFAULT 0,
  success            boolean NOT NULL,
  error_code         text,
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX inv_mutations_log_portal_idx ON inventory_mutations_log (portal_email, created_at DESC);
CREATE INDEX inv_mutations_log_serie_idx  ON inventory_mutations_log (serie) WHERE serie IS NOT NULL;
CREATE INDEX inv_mutations_log_agent_idx  ON inventory_mutations_log (agent_id);

ALTER TABLE inventory_mutations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_mutations_service_role_all ON inventory_mutations_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

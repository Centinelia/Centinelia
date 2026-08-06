-- Nash F1 — infraestructura base para el meerkat interno de Centinelia.
--
-- 1) platform_incidents: cola unificada de trabajo de Nash.
--    Fuentes: bug_reports (reportar_falla), llm_call_log (errores),
--    ops_inbox escalated stale, handoff_failed_responses, agent_tasks failed,
--    detecciones propias de Nash navegando admin, y creación manual.
--
-- 2) Seed idempotente de la cuenta interna "Centinelia" + agente Nash.
--    portal_email='hola@centinelia.mx'. Sin password_hash (Nazre interactúa
--    con Nash vía /admin/soporte, no vía portal público).

CREATE TABLE IF NOT EXISTS platform_incidents (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  priority               TEXT NOT NULL CHECK (priority IN ('low', 'med', 'high', 'critical')),
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'in_progress',
    'sent_to_claude_code',
    'awaiting_verification',
    'resolved',
    'closed'
  )),
  source                 TEXT NOT NULL CHECK (source IN (
    'bug_report',
    'error_log',
    'escalated_inbox',
    'failed_handoff',
    'agent_task',
    'nash_self_discovery',
    'manual'
  )),
  source_id              TEXT,                              -- id externo del item original
  affected_agent_id      UUID REFERENCES voice_agents(id) ON DELETE SET NULL,
  affected_portal_email  TEXT,
  assigned_to            TEXT NOT NULL DEFAULT 'nash' CHECK (assigned_to IN ('nash', 'owner', 'claude_code')),
  github_issue_url       TEXT,
  resolution             TEXT,
  meta                   JSONB
);

CREATE INDEX IF NOT EXISTS platform_incidents_status_idx    ON platform_incidents(status);
CREATE INDEX IF NOT EXISTS platform_incidents_priority_idx  ON platform_incidents(priority);
CREATE INDEX IF NOT EXISTS platform_incidents_source_idx    ON platform_incidents(source, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_incidents_assigned_idx  ON platform_incidents(assigned_to, status, created_at DESC);

CREATE OR REPLACE FUNCTION set_platform_incidents_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS platform_incidents_updated_at_trg ON platform_incidents;
CREATE TRIGGER platform_incidents_updated_at_trg
  BEFORE UPDATE ON platform_incidents
  FOR EACH ROW EXECUTE FUNCTION set_platform_incidents_updated_at();

-- Seed cuenta interna Centinelia (idempotente).
INSERT INTO organizations (portal_email, name, plan, account_status, business_description)
VALUES (
  'hola@centinelia.mx',
  'Centinelia',
  'pro',
  'active',
  'Cuenta interna de Centinelia. Aquí vive Nash, el meerkat operativo que duplica al owner en soporte y admin.'
)
ON CONFLICT (portal_email) DO NOTHING;

-- Seed Nash como voice_agent (idempotente por (portal_email, agent_name)).
INSERT INTO voice_agents (
  client_name,
  business_name,
  agent_name,
  portal_email,
  role,
  role_color,
  plan,
  jornada_type,
  active,
  features
)
SELECT
  'Centinelia',
  'Centinelia',
  'Nash',
  'hola@centinelia.mx',
  'operaciones_internas',
  '#0891B2',
  'pro',
  'tareas',
  TRUE,
  jsonb_build_object(
    'meerkat_role_id',          'nash',
    'is_coordinator',           TRUE,
    'helpdesk',                 TRUE,
    'nash_passive_discovery',   TRUE,
    'nash_active_healthcheck',  FALSE,
    'nash_anomaly_detection',   FALSE,
    'receptionist',             FALSE,
    'lead_qualification',       FALSE,
    'appointment_booking',      FALSE,
    'existing_client_support',  FALSE,
    'smart_transfer',           FALSE,
    'order_taking',             FALSE,
    'multilingual',             FALSE,
    'client_memory',            FALSE,
    'outbound_calls',           FALSE
  )
WHERE NOT EXISTS (
  SELECT 1 FROM voice_agents
  WHERE portal_email = 'hola@centinelia.mx'
    AND agent_name   = 'Nash'
);

-- Templates per-agent → org-level
-- contract_templates y document_templates se comparten entre meerkats del
-- mismo negocio (un template de propuesta comercial es del negocio, no de
-- un empleado específico).
--
-- Applied to prod 2026-08-19. 0 rows en ambas tablas al momento de aplicar
-- (sin backfill necesario). agent_id queda nullable para retrocompat;
-- drop cuando el código verificado en prod por 1-2 semanas.

-- contract_templates: uno por org
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS portal_email TEXT;
ALTER TABLE contract_templates ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE contract_templates DROP CONSTRAINT IF EXISTS contract_templates_agent_id_key;
ALTER TABLE contract_templates ADD CONSTRAINT contract_templates_portal_email_key UNIQUE (portal_email);
COMMENT ON COLUMN contract_templates.agent_id IS 'DEPRECATED 2026-08-19: use portal_email. Nullable; drop after code migration verified.';

-- document_templates: uno por (org, tipo)
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS portal_email TEXT;
ALTER TABLE document_templates ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_agent_id_tipo_key;
ALTER TABLE document_templates ADD CONSTRAINT document_templates_portal_email_tipo_key UNIQUE (portal_email, tipo);
COMMENT ON COLUMN document_templates.agent_id IS 'DEPRECATED 2026-08-19: use portal_email. Nullable; drop after code migration verified.';

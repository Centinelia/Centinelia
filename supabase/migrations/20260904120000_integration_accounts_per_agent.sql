-- Fase 1 de "integraciones per-agent vs org-level"
-- (ver .brain/decisions/2026-09-04-integraciones-per-agent-vs-org-level.md)
--
-- Agrega la columna agent_id a integration_accounts para permitir que Google
-- Calendar, Outlook Calendar, Google Drive y OneDrive vivan a nivel empleado
-- (cada meerkat con su propia cuenta) en vez de acoplarse al OAuth de Gmail.
--
-- Rows org-level actuales (Dropbox, Cal.com, Calendly, Facturación) siguen
-- funcionando con agent_id NULL — el unique existente (portal_email, provider)
-- las protege.
--
-- Rows per-agent nuevos usan (agent_id, provider, capability) como identidad.
-- provider = 'google' | 'microsoft' (semantic shift: workspace provider, no
-- app-específico). capability = 'calendar_google' | 'calendar_microsoft' |
-- 'storage_google' | 'storage_microsoft'.

ALTER TABLE integration_accounts
  ADD COLUMN IF NOT EXISTS agent_id UUID
  REFERENCES voice_agents(id) ON DELETE CASCADE;

-- Unique per-agent: un empleado puede tener a lo mucho una cuenta activa por
-- (provider, capability). WHERE agent_id IS NOT NULL para no chocar con las
-- rows org-level que quedan con agent_id NULL.
CREATE UNIQUE INDEX IF NOT EXISTS integration_accounts_agent_provider_capability_uniq
  ON integration_accounts (agent_id, provider, capability)
  WHERE agent_id IS NOT NULL;

-- Índice para lookups por meerkat (list "cuentas del empleado" en /configurar/[agentId]).
CREATE INDEX IF NOT EXISTS integration_accounts_agent_id_idx
  ON integration_accounts (agent_id)
  WHERE agent_id IS NOT NULL;

COMMENT ON COLUMN integration_accounts.agent_id IS
  'NULL = row org-level (Dropbox, Cal.com, Calendly, Facturación). NOT NULL = cuenta per-empleado (Cal/Drive/OneDrive de un meerkat). Ver .brain/decisions/2026-09-04-integraciones-per-agent-vs-org-level.md';

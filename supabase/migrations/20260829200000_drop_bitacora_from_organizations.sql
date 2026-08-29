-- Fase 5 movió bitácora a voice_agents (empleado-level). Estas cols quedaron
-- huérfanas. Cero refs en código (grep 2026-08-29). Safe drop.
ALTER TABLE organizations
  DROP COLUMN IF EXISTS bitacora_template,
  DROP COLUMN IF EXISTS bitacora_weekly_config;

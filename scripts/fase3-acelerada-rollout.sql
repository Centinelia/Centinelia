-- Fase 3 acelerada rollout: habilitar dedup + email_jobs en TODOS los orgs
-- activos + default=true para nuevos.
--
-- EJECUTAR TRAS 48h de Tortillería sin issues (verificado con
-- scripts/monitor-post-deploy.ts).
--
-- Reversal por org: UPDATE organizations SET X=false WHERE portal_email='...'
--
-- Ver spec: docs/superpowers/specs/2026-09-29-refactor-latencia-email-background-design.md §8
-- Ver spec: docs/superpowers/specs/2026-09-29-middleware-dedup-universal-design.md §6

-- 1) Habilitar en todos los orgs activos (que ya tengan voice_agents activos).
UPDATE organizations
SET dedup_middleware_enabled = true, email_jobs_enabled = true
WHERE portal_email IN (
  SELECT DISTINCT portal_email FROM voice_agents WHERE active = true
);

-- 2) Cambiar default para nuevos orgs (2 migraciones sqldelight-style que
-- SÍ modifican el DEFAULT). Aplicar como migraciones nuevas en supabase:
--
-- supabase/migrations/YYYYMMDDHHMMSS_flip_dedup_middleware_default.sql:
--   ALTER TABLE organizations
--     ALTER COLUMN dedup_middleware_enabled SET DEFAULT true;
--
-- supabase/migrations/YYYYMMDDHHMMSS_flip_email_jobs_default.sql:
--   ALTER TABLE organizations
--     ALTER COLUMN email_jobs_enabled SET DEFAULT true;

-- 3) Verificación post-rollout
SELECT
  COUNT(*) FILTER (WHERE dedup_middleware_enabled)  AS dedup_on,
  COUNT(*) FILTER (WHERE email_jobs_enabled)        AS jobs_on,
  COUNT(*)                                          AS total
FROM organizations;

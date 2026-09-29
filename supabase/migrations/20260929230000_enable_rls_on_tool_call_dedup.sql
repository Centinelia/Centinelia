-- Fix: Supabase advisor `rls_disabled_in_public` en tabla tool_call_dedup.
--
-- La tabla fue creada en la migración 20260929200000_tool_call_dedup.sql
-- (parte del middleware universal de dedup, PR #81) sin ENABLE ROW LEVEL
-- SECURITY. Supabase alert email 2026-09-29 1:42 PM detectó la exposición.
--
-- Estrategia (misma que 20260923120500_enable_rls_on_public_tables.sql):
-- ENABLE ROW LEVEL SECURITY sin CREATE POLICY.
--   - service_role (createAdminClient) tiene BYPASSRLS por default → rutas
--     API de Next.js siguen leyendo/escribiendo sin cambios.
--   - anon y authenticated reciben 0 filas (default deny) sin policy.
--
-- La tabla no tiene ningún consumidor con anon/authenticated key — solo
-- withDedup y el cron dedup-cleanup usan createAdminClient (service_role).
-- Verificado: grep tool_call_dedup src/app/portal → cero usos client-side.
--
-- Idempotente: ENABLE ROW LEVEL SECURITY es no-op si ya está enabled.

ALTER TABLE tool_call_dedup ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE tool_call_dedup IS
  'Dedup content-based de tool calls. RLS habilitado 2026-09-29 tras alerta de Supabase advisor. Access solo via service_role (createAdminClient). Ver docs/superpowers/specs/2026-09-29-middleware-dedup-universal-design.md.';

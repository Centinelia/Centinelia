-- Fase 4 cleanup — DROP de columnas y RPC legacy del sistema dual de billing de ops.
--
-- Context: desde 2026-08 ops_ledger (event-sourced) coexistía con el sistema
-- legacy (columnas aggregadas en organizations + voice_agents). 15/15 orgs
-- activas tienen ops_ledger_enabled=true desde hace meses; account_ops está
-- 100% sync con el ledger. Esta migración destruye los campos legacy stale.
--
-- Mantener (NO drop):
-- - voice_agents.ai_ops_limit         → CONFIG del plan (lo lee get_ops_pool_cap).
-- - organizations.monthly_minutes_used → scope minutos separado (minutes_ledger).
-- - annual_contracts.monthly_ops_pool → config contractual del annual_prepaid.
-- - organizations.ops_ledger_enabled  → feature flag (hoy siempre true, dropear
--                                       en migration separada si queremos simplificar).
--
-- Smoke pre-ejecución (2026-10-09):
-- - 0 orgs annual_prepaid activas (verificado via preflight-fase4-drop.mjs)
-- - 14 orgs stripe activas, 0 inconsistencias account_ops vs ledger
-- - 244 rows/24h en ai_ops_log (ledger funcionando)
-- - RPC consume_ai_ops: 0 call sites en el código post-cleanup
--
-- Reversión: Supabase PITR 7 días. Si algo rompe en prod post-deploy, restore
-- del snapshot pre-migration o re-crear columnas con default 0 (los counters
-- se re-poblarán via nuevo consumo del ledger, el histórico queda en ops_ledger).

BEGIN;

-- 1. Columnas legacy de organizations (counter stale + pool duplicado del plan).
ALTER TABLE organizations DROP COLUMN IF EXISTS monthly_ops_pool;
ALTER TABLE organizations DROP COLUMN IF EXISTS monthly_ops_used;

-- 2. Counter stale per-agente.
ALTER TABLE voice_agents DROP COLUMN IF EXISTS ai_ops_used;

-- 3. RPC legacy consume_ai_ops. Reemplazado por consume_pool_ops (ledger).
--    Buscamos ambas firmas conocidas por si quedó alguna variante.
DROP FUNCTION IF EXISTS public.consume_ai_ops(uuid, int);
DROP FUNCTION IF EXISTS public.consume_ai_ops(p_agent_id uuid, p_count int);

COMMIT;

-- Verificación post-migración (correr manual tras aplicar):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('organizations','voice_agents')
--       AND column_name IN ('monthly_ops_pool','monthly_ops_used','ai_ops_used');
--   -- Debe retornar 0 rows.
--
--   SELECT proname FROM pg_proc WHERE proname = 'consume_ai_ops';
--   -- Debe retornar 0 rows.

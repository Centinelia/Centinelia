-- Fix 2026-08-20: ops_ledger_enabled tenía default false, causando que orgs
-- nuevas creadas después de la unificación (20260811054843) entraran al path
-- LEGACY (contadores directos sin cap ni tracking). AC Proyectos
-- (tania@acproyectos.com, creada 2026-08-18) es el ejemplo del bug.
--
-- Ledger event-sourced es ahora el path canonical (7/8 orgs ya en él); el
-- default debe reflejarlo. Backfill de AC + cualquier otra org futura queda
-- automático.
--
-- No requiere cambio en ops-guard.ts u otro runtime: el path NEW ya existe
-- y funciona en las 7 orgs activas desde 2026-08-11.

ALTER TABLE organizations
  ALTER COLUMN ops_ledger_enabled SET DEFAULT true;

-- Backfill orgs con ops_ledger_enabled=false. Debe ser AC Proyectos y
-- cualquier otra creada entre 20260811054843_unify_ops_ledger_enabled_all_orgs
-- y 20260820200000 (esta migración).
UPDATE organizations
   SET ops_ledger_enabled = true
 WHERE ops_ledger_enabled IS NOT TRUE;

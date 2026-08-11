-- UNIQUE constraint (portal_email, reference_id) en minutes_ledger + ops_ledger
-- (fix H12 audit 2026-08-10).
--
-- Hace REALMENTE idempotentes las RPCs apply_ledger_entry y apply_ops_ledger_entry
-- a nivel base de datos. Sin este constraint, un retry de RPC con el mismo
-- reference_id podía escribir dos rows → doble crédito.
--
-- IMPORTANTE — auditar duplicados ANTES de correr:
--
--   -- Duplicados en minutes_ledger
--   SELECT portal_email, reference_id, kind, COUNT(*)
--   FROM minutes_ledger
--   WHERE reference_id IS NOT NULL
--   GROUP BY portal_email, reference_id, kind
--   HAVING COUNT(*) > 1;
--
--   -- Duplicados en ops_ledger
--   SELECT portal_email, reference_id, kind, COUNT(*)
--   FROM ops_ledger
--   WHERE reference_id IS NOT NULL
--   GROUP BY portal_email, reference_id, kind
--   HAVING COUNT(*) > 1;
--
-- Si hay dupes: revisar caso por caso. Usualmente se conserva el más antiguo
-- y se marcan los demás con kind='duplicado_reconciliado' + amount=0 antes de
-- crear el índice. NO hacer DELETE de rows del ledger (audit trail).
--
-- Post-cleanup, correr esta migration. Si falla, salir; investigar; reintentar.

-- Partial: incluye reference_id (evita rows sin ref, que son legítimos duplicables
-- como setup_new_agent legacy). Incluye kind para permitir un mismo reference_id
-- en dos categorías distintas (e.g. session.id en 'renewal' + 'rollover_cap').

create unique index if not exists minutes_ledger_portal_ref_kind_uniq
  on minutes_ledger(portal_email, reference_id, kind)
  where reference_id is not null;

create unique index if not exists ops_ledger_portal_ref_kind_uniq
  on ops_ledger(portal_email, reference_id, kind)
  where reference_id is not null;

notify pgrst, 'reload schema';

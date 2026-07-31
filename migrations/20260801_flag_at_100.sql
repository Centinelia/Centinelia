-- Pilar 3 follow-up: auto-promote tracking
-- Ver docs/superpowers/plans/2026-08-01-flag-auto-promote.md

BEGIN;

ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS at_100_since TIMESTAMPTZ;

-- Backfill conservador: para flags ya en 100% y no killed,
-- usar updated_at como aproximacion del "desde cuando".
UPDATE feature_flags
   SET at_100_since = updated_at
 WHERE rollout_pct = 100
   AND killed = FALSE
   AND at_100_since IS NULL;

COMMIT;

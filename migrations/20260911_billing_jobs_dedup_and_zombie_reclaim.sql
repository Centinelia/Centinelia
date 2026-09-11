-- 2026-09-11 — Cierre de 3 bugs en billing_jobs:
--
-- 1. Dedup de enqueue: dos ticks del cron pueden ver el mismo email y
--    enqueue 2 jobs para el mismo (portal_email, kind, email_id). Actualmente
--    ambos corren, uno gana el claim y el otro repite el trabajo.
--
-- 2. Zombie reclaim: worker killed mid-run (Vercel timeout, deploy) deja el
--    job en status='running' para siempre — nunca se re-claimea. Verificado
--    hoy en prod: job 929b9195 lleva 3 días 18h corriendo.
--
-- 3. Retry backoff: markFailed resetea a 'pending' inmediato. Un job que
--    falla por Dropbox down retry 3 veces en < 1 seg, spam a Dropbox.
--    Agregamos next_attempt_at para retry con backoff exponencial.

-- ---------------------------------------------------------------------------
-- Bug 3: columna next_attempt_at para backoff exponencial
-- ---------------------------------------------------------------------------
ALTER TABLE billing_jobs
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

COMMENT ON COLUMN billing_jobs.next_attempt_at IS
  'Timestamp del próximo intento tras un fallo. Retry solo si NOW() >= next_attempt_at.';

-- ---------------------------------------------------------------------------
-- Bug 1: unique index para dedup de enqueue (partial: solo jobs activos)
-- ---------------------------------------------------------------------------
-- Un mismo (portal_email, kind, email_id) NO puede tener 2 jobs pending o
-- running simultáneos. Sí puede haber múltiples "done" o "failed" en la
-- historia. WHERE partial evita bloquear reintentos históricos.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_jobs_active_email
  ON billing_jobs (portal_email, kind, (payload->>'email_id'))
  WHERE status IN ('pending', 'running');

COMMENT ON INDEX uniq_billing_jobs_active_email IS
  'Cierra dedup de enqueue. Dos ticks del cron ya no pueden crear jobs ' ||
  'duplicados para el mismo email. Partial (status pending|running) permite ' ||
  'historial de reintentos.';

-- ---------------------------------------------------------------------------
-- Bug 2 + 3: RPC claim_billing_job actualizada con zombie reclaim + backoff
-- ---------------------------------------------------------------------------
-- Cambios vs versión anterior:
--   a) Reclamable si status='running' AND started_at < NOW() - 10 min (zombie).
--   b) Respeta next_attempt_at para backoff (skip si NOW() < next_attempt_at).
CREATE OR REPLACE FUNCTION claim_billing_job()
RETURNS SETOF billing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE billing_jobs
  SET
    status     = 'running',
    attempts   = attempts + 1,
    started_at = NOW()
  WHERE id = (
    SELECT id
    FROM   billing_jobs
    WHERE  (
             -- Job pending sin backoff pendiente
             (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
             -- Zombie: running > 10 min (worker murió sin marcar done/failed)
             OR (status = 'running' AND started_at < NOW() - INTERVAL '10 minutes')
           )
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION claim_billing_job() IS
  'Claim atómico de job pending con TTL de zombie reclaim (10 min) y respeto ' ||
  'de next_attempt_at para backoff exponencial. Cierra bugs A5 (zombie) y M4 (backoff).';

-- ---------------------------------------------------------------------------
-- Housekeeping: liberar el zombie actual (job en running hace > 3 días)
-- para que el próximo cron lo procese via el nuevo TTL.
-- ---------------------------------------------------------------------------
UPDATE billing_jobs
SET status = 'pending', started_at = NULL, last_error = 'auto-reclaimed by migration 20260911 (was zombie for >3 days)'
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '1 hour';

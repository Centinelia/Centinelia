-- 2026-09-11 — RPC para claim atómico de billing_pending_review antes de submit.
--
-- Contexto: submit-approved.ts hace SELECT status='approved' + WHERE xml_path IS NULL,
-- procesa en loop, cada iter llama adapter.submitInvoiceBatch (Dropbox) + UPDATE
-- xml_path. Sin lock, 2 workers concurrentes ven la misma row y ambos escriben
-- el mismo XML (idempotente en el adapter por SHA256, pero desperdicia I/O y
-- rompe si un futuro adapter no es content-hash idempotente).
--
-- Fix: RPC atómica que marca extracted.submit_started_at solo si (a) no hay
-- xml_path ya, y (b) no hay claim vigente en los últimos N segundos. Retorna
-- 1 fila si claimed, 0 si otra sesión ya la tiene o ya terminó.
--
-- Uso desde submit-approved.ts:
--   const { data } = await supabase.rpc('claim_pending_for_submit', {
--     p_id: row.id, p_stale_seconds: 300,
--   });
--   if (!data || data.length === 0) continue; // otro worker la tiene

CREATE OR REPLACE FUNCTION claim_pending_for_submit(
  p_id             uuid,
  p_stale_seconds  int DEFAULT 300
) RETURNS TABLE (id uuid, extracted jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE billing_pending_review AS r
  SET extracted = jsonb_set(
        COALESCE(r.extracted, '{}'::jsonb),
        '{submit_started_at}',
        to_jsonb(NOW()::text)
      )
  WHERE r.id = p_id
    -- Guard 1: no re-submitear rows que ya tienen XML.
    AND NOT (COALESCE(r.extracted, '{}'::jsonb) ? 'xml_path')
    -- Guard 2: no colisionar con claim reciente. Un claim > p_stale_seconds
    -- se considera zombie (worker murió mid-run) y es reclaimable.
    AND (
      NOT (COALESCE(r.extracted, '{}'::jsonb) ? 'submit_started_at')
      OR (r.extracted->>'submit_started_at')::timestamptz
         < NOW() - (p_stale_seconds || ' seconds')::interval
    )
  RETURNING r.id, r.extracted;
END;
$$;

COMMENT ON FUNCTION claim_pending_for_submit(uuid, int) IS
  'Claim atómico para submit-approved. Retorna la row si el worker actual la ' ||
  'reclamó exitosamente, empty si otro worker ya la tiene o si ya se sometió. ' ||
  'Cierra race entre workers concurrentes sobre billing_pending_review.';

-- Flag per-org para pausar cobros al pool.
--
-- Caso que motiva (2026-10-10): AC Proyectos terminó Fase 1 de Nami, pool
-- vaciado intencionalmente, en espera de pago Mensualidad 2 (~1-nov).
-- Mientras tanto Camila sigue mandando correos y Nami sigue procesándolos.
-- Sin este flag, cada procesamiento intentaba cobrar, dejaba balance
-- negativo (-4 observado) y disparaba el drift detector de pool
-- provisioning. Con el flag, las operaciones ejecutan normal pero NO
-- consumen del ledger ni gatillan la alerta.
--
-- Semántica:
--   billing_paused_at IS NULL  → cobro normal (default).
--   billing_paused_at IS NOT NULL → consumeAiOp registra audit en
--     ai_ops_log con count=0 + context={billing_paused_at,
--     intended_count}, pero NO llama al RPC consume_pool_ops ni decrementa
--     el pool. Retorna ok:true para que downstream no bloquee.
--
-- Al llegar el pago/reactivación, el admin UI (o migración manual) resetea
-- billing_paused_at a NULL y el cobro vuelve a ser normal.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_paused_at timestamptz NULL;

COMMENT ON COLUMN organizations.billing_paused_at IS
  'Timestamp cuando se pausó el cobro al pool para esta org. NULL = cobro normal. Set = consumeAiOp retorna ok sin decrementar pool. Casos: pre-pago renovación, periodo de prueba interno, debug con cliente real.';

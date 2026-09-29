-- Añade 'incident_registered' al CHECK constraint de voice_calls.outcome.
--
-- Schema drift descubierto 2026-09-29 (Tortillería / Tecate Six Cantú):
-- detectOutcome() en src/app/api/voice/webhook/route.ts:1135 devuelve
-- 'incident_registered' cuando la llamada invocó registrar_incidencia.
-- El CHECK original no lo incluye → INSERT falla con 23514
-- (voice_calls_outcome_check violation) → row de voice_calls nunca se crea
-- → llamada NO cuenta minutos, NO aparece en portal, NO se hace self-eval,
-- NO dispara agregaciones. Undercount silencioso.
--
-- Evidencia: llamada Nelia 2026-09-29 18:35 UTC quedó sin row en voice_calls
-- (tool_call_log tenía los rows, ledger cobró, pero voice_calls vacío) —
-- Vercel logs mostraron el error 23514.
--
-- El código de detectOutcome ya está en producción y el outcome se calcula
-- correctamente; solo falta que el schema lo acepte.
--
-- Ver también: policy/audit-call-flow-6-reglas (silent DB inserts prohibidos).

ALTER TABLE voice_calls
  DROP CONSTRAINT IF EXISTS voice_calls_outcome_check;

ALTER TABLE voice_calls
  ADD CONSTRAINT voice_calls_outcome_check CHECK (outcome IN (
    'lead_created',
    'appointment_booked',
    'order_taken',
    'transferred',
    'info_provided',
    'unanswered',
    'escalated_whatsapp',
    'incident_registered',
    'other'
  ));

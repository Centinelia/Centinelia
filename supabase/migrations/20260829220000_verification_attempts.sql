-- Multi-intento de verificación. Nelia puede llamar al mismo cliente N veces
-- (por ejemplo cuando la primera vez no contestan) y cada llamada queda
-- registrada. verification_called_at + verification_result siguen reflejando
-- el ÚLTIMO intento (backwards compat con UI + tools + cron).

ALTER TABLE client_incidents
  ADD COLUMN IF NOT EXISTS verification_attempts JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN client_incidents.verification_attempts IS
  'Historial de intentos de verificación. Array de { called_at (ISO), result (ok|no_visitado|sin_respuesta), notes (text|null) } ordenado cronológicamente. Última entrada = valor actual de verification_called_at/verification_result. Sin nueva tabla para mantener el cambio ligero — migrar a tabla dedicada si el volumen lo justifica.';

-- Backfill: incidents con verification_called_at previo → array con 1 elemento
UPDATE client_incidents
SET verification_attempts = jsonb_build_array(
  jsonb_build_object(
    'called_at', verification_called_at,
    'result',    verification_result,
    'notes',     verification_result_notes
  )
)
WHERE verification_called_at IS NOT NULL
  AND jsonb_array_length(verification_attempts) = 0;

-- enterprise_quotes: agrega contexto extra que ahora captura /cotizar.
--
-- Motivación: desde el rediseño de /cotizar (2026-10-17) el formulario
-- recibe dos campos que antes no existían:
--   - meerkat_role_id: si el cliente llegó desde /registro con un empleado
--     específico ya elegido (p. ej. ?role=noah), guardamos cuál para que
--     el seguimiento lleve ese contexto en la propuesta.
--   - preguntas: nuevo textarea "¿Tienes dudas que quieras resolver antes?".
--     Permite al cliente mandar preguntas al equipo en la misma solicitud.
--
-- Además `empleados` deja de ser NOT NULL porque cuando viene con
-- meerkat_role_id, el campo "¿Cuántos empleados?" se oculta en UI (no tiene
-- sentido pedir "cuántos Noahs"). Default '1' para registros nuevos sin el campo.
--
-- No requiere RLS adicional: inserts al endpoint corren con service role.

ALTER TABLE enterprise_quotes
  ADD COLUMN IF NOT EXISTS meerkat_role_id TEXT,
  ADD COLUMN IF NOT EXISTS preguntas       TEXT;

ALTER TABLE enterprise_quotes
  ALTER COLUMN empleados DROP NOT NULL,
  ALTER COLUMN empleados SET DEFAULT '1';

COMMENT ON COLUMN enterprise_quotes.meerkat_role_id IS 'Rol del meerkat preseleccionado desde /registro?role=X (nia, noah, nami, etc.). NULL si vino al flujo genérico.';
COMMENT ON COLUMN enterprise_quotes.preguntas       IS 'Dudas que el cliente quiere resolver antes del seguimiento. Se incluye en el correo de notificación interna.';

-- Pack hr_nomina v1.1 — montos de retardo per-empleado.
--
-- Contexto: AC Proyectos tiene DOS grupos de reglas de retardo:
--  - Administrativos: $200 base / $400 doble (en rrhh_nomina_config)
--  - Operativos (7 excepciones): $50 base / $100 doble, turno 12h.
--
-- Patrón idéntico al que ya usamos para sueldo_diario_mxn: columnas opcionales
-- per-empleado que ganan sobre los valores globales de la config si están
-- presentes. Si están NULL, cae al fallback global.
--
-- Confirmado por Lucero Longoria 2026-10-15 vía WhatsApp + Excel "EXCEPCIONES
-- RELOJ CHECADOR" con los 7 reloj_ids afectados (120, 215, 144, 158, 186, 187,
-- 217).
--
-- Esta migración es ADD COLUMN puro, idempotente, no toca la migración
-- anterior que ya está aplicada en prod.

BEGIN;

ALTER TABLE rrhh_empleados
  ADD COLUMN IF NOT EXISTS monto_retardo_base_mxn  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS monto_retardo_doble_mxn NUMERIC(10,2);

COMMENT ON COLUMN rrhh_empleados.monto_retardo_base_mxn IS
  'Override per-empleado del monto de retardo base (8:01 hasta umbral doble). Si NULL, cae a rrhh_nomina_config.monto_retardo_base. Usado para grupos de empleados con reglas distintas (ej. operativos de AC con $50 vs administrativos con $200).';

COMMENT ON COLUMN rrhh_empleados.monto_retardo_doble_mxn IS
  'Override per-empleado del monto de retardo doble (umbral doble hasta umbral falta). Si NULL, cae a rrhh_nomina_config.monto_retardo_doble.';

COMMIT;

-- Pack hr_nomina v1.2 — modelo "turno cubierto" + regla checada incompleta.
--
-- Contexto AC Proyectos (Lucero 2026-10-15/16):
-- - 7 operativos usan modelo "turno cubierto": no se calcula por hora de
--   check-in sino por tiempo trabajado vs turno requerido. Umbrales 1-30 min
--   faltantes = base ($50), 30-90 = doble ($100), 90+ = falta (sueldo).
-- - Regla transversal: si en el día solo checó entrada o solo salida (no las
--   dos), rebaje fijo $100 para todos. Excepción: Omar Castillo (configurable
--   per empleado con checada_incompleta_monto_mxn = 0).
--
-- Esta migración agrega 4 columnas opt-in a rrhh_empleados + 1 fallback global
-- a rrhh_nomina_config. Idempotente, no toca migraciones anteriores.

BEGIN;

ALTER TABLE rrhh_empleados
  ADD COLUMN IF NOT EXISTS turno_horas_requeridas       NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS ventana_entrada_desde        TIME,
  ADD COLUMN IF NOT EXISTS ventana_entrada_hasta        TIME,
  ADD COLUMN IF NOT EXISTS checada_incompleta_monto_mxn NUMERIC(10,2);

COMMENT ON COLUMN rrhh_empleados.turno_horas_requeridas IS
  'Si NULL, el empleado se calcula con modelo admin (check-in vs hora_entrada fija). Si tiene valor (ej. 12.0), se calcula con modelo turno cubierto: tiempo_trabajado = ultima_checada - primera_checada, se compara contra este requerido, y los minutos faltantes disparan el escalonado base/doble/falta (umbrales 30/90 de rrhh_nomina_config).';

COMMENT ON COLUMN rrhh_empleados.ventana_entrada_desde IS
  'Modo turno cubierto: hora más temprana permitida de check-in sin penalización adicional (ej. 08:00 para operativos AC). Si NULL, no hay restricción de ventana.';

COMMENT ON COLUMN rrhh_empleados.ventana_entrada_hasta IS
  'Modo turno cubierto: hora más tarde permitida de check-in sin penalización adicional (ej. 09:00 para operativos AC). Si NULL, no hay restricción de ventana. Nota: hoy la lógica no penaliza por ventana directamente; penaliza por tiempo faltante del turno. Ventana reservada para futuras reglas más estrictas.';

COMMENT ON COLUMN rrhh_empleados.checada_incompleta_monto_mxn IS
  'Monto a cobrar cuando el empleado checa UNA sola vez en el día (entrada sin salida o viceversa). NULL = usa rrhh_nomina_config.monto_checada_incompleta_default (fallback). 0 = no se cobra (ej. Omar Castillo según Lucero 2026-10-16).';

ALTER TABLE rrhh_nomina_config
  ADD COLUMN IF NOT EXISTS monto_checada_incompleta_default NUMERIC(10,2);

COMMENT ON COLUMN rrhh_nomina_config.monto_checada_incompleta_default IS
  'Fallback global para checada incompleta cuando el empleado no tiene checada_incompleta_monto_mxn seteado. AC Proyectos: $100 (confirmado Lucero 2026-10-16).';

COMMIT;

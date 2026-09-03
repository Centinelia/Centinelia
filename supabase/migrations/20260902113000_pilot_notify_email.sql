-- Monitoreo activo de orgs en piloto/demo.
--
-- Cuando pilot_notify_email está seteado, el cron /api/cron/pilot-monitor
-- corre cada 30 min y envía email consolidado a esa dirección si detecta
-- anomalías en la org en la última ventana (calls con self_eval bajo, tool
-- errors, consumo de pool sobre umbral, bug reports).
--
-- Uso típico (Fondo Demo del Norte durante los 13 días previos a la cita):
--   UPDATE organizations
--   SET pilot_notify_email = 'nazre20@gmail.com'
--   WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';
--
-- Para retirar del monitoreo: SET pilot_notify_email = NULL.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pilot_notify_email TEXT;

COMMENT ON COLUMN organizations.pilot_notify_email IS
  'Cuando está seteado, la org está en modo piloto/demo con monitoreo activo. El cron /api/cron/pilot-monitor envía alertas de anomalías (errores, self_eval bajo, consumo alto) a esta dirección cada 30 min. NULL = sin monitoreo. Ver /api/cron/pilot-monitor.';

-- Feature flag por org para avisos automáticos de llamadas sin reporte.
-- Cuando true, al cerrar una llamada sin acción concreta (sin registrar_incidencia,
-- sin registrar_cliente_nuevo, sin cita, sin pedido, sin transferencia) o cuando
-- el cliente colgó antes de conectar, se envía correo al directorio de encargados
-- con el número del cliente y su nombre si aparece en la base de datos.
--
-- Pedido por Ramón (dueño Tortillería Estrella) 2026-09-30: cada llamada sin
-- reporte debe generar 1 correo (sin dedup, sin digest).
--
-- Default false. Activación por-org SQL manual (por ahora solo Tortillería).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS notify_calls_without_report boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.notify_calls_without_report IS
  'Avisar por correo cada llamada sin reporte (unanswered / other / info_provided). Recipients = directory receives_incident_reports=true. 1 llamada = 1 correo, sin dedup. Pedido Ramón Tortillería 2026-09-30.';

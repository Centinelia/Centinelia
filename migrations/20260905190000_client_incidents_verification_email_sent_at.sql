-- Opción B (Tortillería Estrella 2026-09-05): tras cada verificar_recepcion_incidencia,
-- Nelia manda correo tarjeta con el resultado a los mismos recipients del incidente
-- inicial. Timestamp del envío exitoso para audit y para poder detectar (en el futuro)
-- verificaciones que no notificaron por falta de recipients.

ALTER TABLE client_incidents
  ADD COLUMN IF NOT EXISTS verification_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN client_incidents.verification_email_sent_at IS
  'Timestamp del correo de reporte tras verificar_recepcion_incidencia. NULL si no hubo recipients configurados o falló el envío. Distinto de email_sent_at (correo del incidente inicial).';

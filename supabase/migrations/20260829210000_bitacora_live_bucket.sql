-- Bucket privado para archivos xlsx persistentes de bitácora.
-- Path: bitacora-live/{portal_email}/{agent_id}/{YYYY-MM}.xlsx
-- Cada sabado 14:00 el cron actualiza el archivo del mes en curso.
-- Solo aplica cuando el empleado tiene template custom subido.
INSERT INTO storage.buckets (id, name, public)
VALUES ('bitacora-live', 'bitacora-live', false)
ON CONFLICT (id) DO NOTHING;

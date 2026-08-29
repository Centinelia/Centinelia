-- 2026-08-28: sucursal column in client_incidents.
-- Match key de is_new_client cambia de contact_phone a (business_name, sucursal).
-- Un mismo negocio con múltiples sucursales (Don Dante Apodaca vs Don Dante San Nicolás)
-- ahora se distingue correctamente. contact_phone queda como memoria de "quién habló".

ALTER TABLE client_incidents
  ADD COLUMN IF NOT EXISTS sucursal TEXT NULL;

COMMENT ON COLUMN client_incidents.sucursal IS
  'Identificador de sucursal cuando el negocio tiene más de una (ej. "Apodaca", "San Nicolás"). NULL si el negocio tiene una sola.';

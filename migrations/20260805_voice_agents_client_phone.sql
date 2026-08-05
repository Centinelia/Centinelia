-- Agrega columna para teléfono del cliente/contacto (nivel bulk por portal_email).
-- Usada en /admin/clientes/[key]/editar como campo de Contacto.

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS client_phone text NULL;

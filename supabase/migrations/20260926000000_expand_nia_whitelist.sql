-- Ampliación de whitelist de tags para el rol 'nia'.
--
-- Contexto: los meerkats de recepción en negocios de gobierno/municipio
-- consultan fichas oficiales con tags fiscales/financieros/legales
-- (multas de tránsito, impuesto predial, ISAI, licencias, permisos).
-- La whitelist original de Nia (atencion_cliente, catalogo_productos,
-- politicas, ventas, onboarding_clientes) no cubría esos dominios.
--
-- Antes de esta migration el equipo tenía que agregar 'politicas' manualmente
-- a esas fichas para que Nia las consultara. Con esta ampliación se consultan
-- por sus tags naturales.
--
-- Aplicación: aditiva idempotente (ON CONFLICT DO NOTHING). No cambia
-- comportamiento en clientes que no tengan fichas con esos tags.
--
-- Ver 20260924130100_role_default_tag_whitelist.sql para el seed original.

INSERT INTO role_default_tag_whitelist (role, tag_slug)
VALUES
  ('nia', 'fiscal'),
  ('nia', 'operaciones'),
  ('nia', 'finanzas'),
  ('nia', 'legal')
ON CONFLICT (role, tag_slug) DO NOTHING;

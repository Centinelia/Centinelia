-- Setup de Nala Ramón Leang (retail Público General).
-- Ejecutar UNA vez cuando Nazre confirme datos con Ramón. Idempotente en su
-- mayoría — usa INSERT ... ON CONFLICT + jsonb merge.
--
-- Prerequisitos:
--   1. La organización servicioalcliente@tortillasestrella.com.mx ya existe.
--   2. El Dropbox de la organización está conectado con refresh_token válido
--      en organization_integrations (type='contpaqi', legacy) O en
--      integration_accounts per-agent. Este script prefiere legacy; si se
--      migró todo a per-agent, hay que ajustar la subquery del Paso 2.
--   3. Hay un CONTPAQi ya abierto en la máquina de Beatriz PV (AD2022_RAMONLEANG).
--   4. Beatriz PV instaló el Writer v0.11.4 en su PC apuntando a AD2022_RAMONLEANG.
--
-- ADVERTENCIA sobre dropbox_base_path:
--   No hay UNIQUE constraint en (portal_email, dropbox_base_path). Si accidentalmente
--   otra integration usa '/RamonLeang' se pierde la separación de flujos.
--   El operador debe verificar manualmente antes de correr esto.
--
-- Toda la operación va en 1 transacción — si el Paso 2 falla, el Paso 1 rollback.

BEGIN;

-- ---------------------------------------------------------------------------
-- Paso 0: guard hard — validar que el dropbox_token existe antes de proceder.
-- Sin esto, el Paso 2 insertaría NULL silenciosamente y el pipeline crashea
-- en runtime al intentar subir XMLs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dropbox_token_val text;
BEGIN
  SELECT config->>'dropbox_token' INTO dropbox_token_val
  FROM organization_integrations
  WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx'
    AND type = 'contpaqi'
  LIMIT 1;

  IF dropbox_token_val IS NULL OR length(dropbox_token_val) < 10 THEN
    RAISE EXCEPTION 'setup-ramon-leang: no encontré dropbox_token en organization_integrations type=contpaqi para servicioalcliente@tortillasestrella.com.mx. Conecta Dropbox primero desde el portal o pega el token manualmente en la subquery del Paso 2.';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Paso 1: crear Nala Ramón (nuevo voice_agent con role 'facturacion' y
-- features.ramon_leang_config).
-- ---------------------------------------------------------------------------
INSERT INTO voice_agents (
  id,
  portal_email,
  agent_name,
  active,
  client_name,
  client_email,
  role,
  features
) VALUES (
  gen_random_uuid(),
  'servicioalcliente@tortillasestrella.com.mx',
  'Nala Ramón',
  true,
  'Beatriz',                              -- Beatriz PV (misma primer nombre, otra persona)
  'Beatriz-PV@hotmail.com',                -- correo humano para notif
  'facturacion',
  jsonb_build_object(
    'meerkat_role_id', 'nala',
    'ramon_leang_config', jsonb_build_object(
      'rfcEmisor',     'LEGR730729PU9',
      'razonSocial',   'RAMON OMAR LEANG GUTIERREZ',
      'regimenFiscal', '612',
      'codigoPostal',  '66470',
      'serie',         'RL',
      'usoCFDI',       'G01',
      'formaPago',     '01',   -- efectivo (venta al público general)
      'sku',           'VT',
      'descripcion',   'Venta de Tortilla',
      'ivaTasa',       0,
      'claveSAT',      '50161509',
      'unidadSAT',     'KGM'
    )
  )
)
RETURNING id, agent_name, client_email;

-- ---------------------------------------------------------------------------
-- Paso 2: crear organization_integrations type='contpaqi_ramonleang'.
-- ADVERTENCIA: ya existe una type='contpaqi' para Tortillería Estrella
-- con el mismo portal_email. Usamos un type distinto para separar los flujos.
-- ---------------------------------------------------------------------------
INSERT INTO organization_integrations (
  id,
  portal_email,
  type,
  config
) VALUES (
  gen_random_uuid(),
  'servicioalcliente@tortillasestrella.com.mx',
  'contpaqi_ramonleang',
  jsonb_build_object(
    'type',              'contpaqi',
    'storage_backend',   'dropbox',
    'dropbox_token',     (SELECT config->>'dropbox_token' FROM organization_integrations WHERE portal_email='servicioalcliente@tortillasestrella.com.mx' AND type='contpaqi' LIMIT 1),
    'dropbox_base_path', '/RamonLeang',
    'fiscal', jsonb_build_object(
      'rfc_emisor',                 'LEGR730729PU9',
      'regimen_fiscal',             '612',
      'serie_default',              'RL',
      'uso_cfdi_default',           'G01',
      'clave_sat_default_producto', '50161509',
      'codigo_postal_emisor',       '66470'
    ),
    'scheduled_task', jsonb_build_object(
      'expected_sync_interval_minutes', 60,
      'stale_warning_minutes',          180,
      'stale_escalation_hours',         12
    )
  )
)
ON CONFLICT (portal_email, type) DO UPDATE
SET config = EXCLUDED.config
RETURNING id, type;

COMMIT;

-- ---------------------------------------------------------------------------
-- Paso 3: verificaciones post-insert (fuera de la transacción, solo lectura)
-- ---------------------------------------------------------------------------
SELECT
  'Nala Ramón' as check,
  id, agent_name, client_email, client_name, active,
  features->'ramon_leang_config'->>'rfcEmisor' as rfc,
  features->'ramon_leang_config'->>'serie' as serie
FROM voice_agents
WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx'
  AND agent_name = 'Nala Ramón';

SELECT
  'Integration Ramón' as check,
  id, type,
  config->>'dropbox_base_path' as base_path,
  config->'fiscal'->>'rfc_emisor' as rfc,
  length(config->>'dropbox_token') > 10 as dropbox_token_ok
FROM organization_integrations
WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx'
  AND type = 'contpaqi_ramonleang';

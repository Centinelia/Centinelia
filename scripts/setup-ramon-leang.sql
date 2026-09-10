-- Setup de Nala Ramón Leang (retail Público General).
-- Ejecutar UNA vez cuando Nazre confirme datos con Ramón. Idempotente en su
-- mayoría — usa INSERT ... ON CONFLICT + jsonb merge.
--
-- Prerequisitos:
--   1. La organización servicioalcliente@tortillasestrella.com.mx ya existe.
--   2. El Dropbox de la organización está conectado con refresh_token válido.
--   3. Hay un CONTPAQi ya abierto en la máquina de Beatriz PV (AD2022_RAMONLEANG).
--   4. Beatriz PV instaló el Writer v0.11.4 en su PC apuntando a AD2022_RAMONLEANG.

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
-- Paso 2: crear organization_integrations type='contpaqi' para Ramón Leang.
-- ADVERTENCIA: ya existe una para Tortillería Estrella con el mismo portal_email.
-- Necesitamos permitir 2 rows contpaqi por org, o usar un subtype distinto.
-- Aquí uso type='contpaqi_ramonleang' como workaround.
-- ---------------------------------------------------------------------------
-- OPCIÓN A (recomendada): distinto type. Requiere adaptar buildAdapter si lee
-- por type='contpaqi' estricto.
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

-- ---------------------------------------------------------------------------
-- Paso 3: verificaciones post-insert
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
  config->'fiscal'->>'rfc_emisor' as rfc
FROM organization_integrations
WHERE portal_email = 'servicioalcliente@tortillasestrella.com.mx'
  AND type = 'contpaqi_ramonleang';

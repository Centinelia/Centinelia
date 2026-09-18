-- Migration: seed VoiceAgent "Nia Landing Demo"
-- Crea el agente demo aislado que usa el pipeline de callback de landing.
-- Se sincroniza con Vapi manualmente via POST /api/admin/agents/[id]/sync
-- (no existe scripts/sync-agent-to-vapi.ts — se usa el endpoint admin existente).
--
-- Diferencias vs el brief original (corregidas contra schema real):
-- * organizations.portal_email es la PK (no id uuid). No existe columna id en organizations.
-- * voice_agents no tiene columna org_id — usa portal_email como anchor a la org.
-- * plan = 'pro' (el unico Plan permitido en src/types/agent.ts; 'demo' no esta en el CHECK).
-- * client_name es NOT NULL (requerido por schema.sql:9).
-- * ai_ops_limit es nullable — se omite (default NULL, coalesce a 0 en funciones que lo leen).
-- * LANDING_DEMO_AGENT_ID = '00000000-0000-0000-0000-000000000001'
-- * LANDING_DEMO_PORTAL_EMAIL = 'landing-demo@centinelia.mx'

-- 1. Org especial de aislamiento para el agente demo.
--    portal_email es la PK; no aparece en /admin/clientes porque no tiene Stripe ni facturacion.
insert into organizations (portal_email, name, plan)
values ('landing-demo@centinelia.mx', 'Centinelia Landing Demo', 'pro')
on conflict (portal_email) do nothing;

-- 2. Agente demo. system_prompt vacio → se llena al sincronizar con Vapi.
--    features.landing_demo=true permite identificarlo como demo en metricas.
--    minutes_included = 99999 evita que el pool bloquee llamadas demo.
insert into voice_agents (
  id,
  client_name,
  business_name,
  business_description,
  business_phone_display,
  phone_number,
  plan,
  portal_email,
  agent_name,
  active,
  features,
  minutes_included,
  minutes_used
)
values (
  '00000000-0000-0000-0000-000000000001',
  'Centinelia',
  'Centinelia',
  'Empleados digitales para PYMEs mexicanas',
  '',        -- se llena al asignar numero Twilio/Vapi
  '',        -- se llena al asignar numero Twilio/Vapi
  'pro',
  'landing-demo@centinelia.mx',
  'Nia',
  true,
  jsonb_build_object(
    'receptionist',        true,
    'lead_qualification',  true,
    'outbound_calls',      true,
    'meerkat_role_id',     'nia',
    'landing_demo',        true
  ),
  99999,
  0
)
on conflict (id) do nothing;

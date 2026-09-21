-- Migration: extender landing_callback_requests con contexto del prospect
-- Para que Nia haga demo dinamizado hablando como si fuera empleada del negocio
-- del prospect, guardamos 3 campos que llenó en el form:
--   * org_name          — nombre del negocio del prospect
--   * org_description   — qué hace el negocio (1-2 líneas)
--   * expectation       — qué quiere probar en la llamada demo (1-2 líneas)
--
-- Estos campos se usan en src/lib/vapi/landing-demo.ts para construir el
-- campaignInstructions dinámico que Vapi inyecta al system prompt SOLO para
-- esa llamada específica del agente demo (LANDING_DEMO_AGENT_ID).
-- Las Nias contratadas de clientes reales NO son afectadas.

alter table landing_callback_requests
  add column if not exists org_name        text,
  add column if not exists org_description text,
  add column if not exists expectation     text;

comment on column landing_callback_requests.org_name        is 'Nombre del negocio del prospect capturado en form landing demo';
comment on column landing_callback_requests.org_description is 'Descripción breve del negocio (1-2 líneas) para contextualizar la llamada de Nia demo';
comment on column landing_callback_requests.expectation     is 'Qué espera el prospect probar en la llamada demo (1-2 líneas)';

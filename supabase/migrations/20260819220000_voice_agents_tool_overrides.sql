-- Capa 3 tool-bloat: overrides finos por meerkat.
--
-- Permite al owner deshabilitar tools específicas del preset del rol, o
-- habilitar tools extra fuera del preset. Se aplica DESPUÉS del filtro por
-- preset en los 3 canales (voice, chat, email):
--
--   tools = (preset del rol ∪ universales) - disabled + enabled
--
-- Ejemplos:
--   - Noah tiene generar_propuesta_comercial en su preset. Un cliente concreto
--     no lo quiere → agregar a disabled.
--   - Nia por default no tiene enviar_correo. Un cliente quiere que Nia
--     responda ciertos correos → agregar a enabled.
--
-- Aplicada a prod 2026-08-19. Backend runtime: src/lib/tools/tool-overrides.ts
-- + apply en inbox-processor.ts, agent-chat/route.ts, vapi/sync.ts.
-- Endpoint: PATCH /api/portal/[token]/agentes/[agentId]/tool-overrides
-- UI: pendiente (se puede editar via SQL o el endpoint por ahora).

ALTER TABLE voice_agents
  ADD COLUMN IF NOT EXISTS tool_overrides JSONB NOT NULL DEFAULT '{"disabled":[],"enabled":[]}'::jsonb;

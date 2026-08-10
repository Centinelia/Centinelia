-- Mover portal_password_hash de voice_agents (per-agent) a organizations (per-org).
--
-- Contexto: post-migración org-level portal_token (2026-08-09/10), el password
-- semánticamente vive per-org (un usuario humano por org). Estaba en voice_agents
-- por artefacto histórico y solo se seteaba en UN peer, forzando filtros
-- `IS NOT NULL` en login para no caer en peer sin password.
--
-- Backfill: cualquier hash no-null encontrado en voice_agents del portal_email
-- se copia a organizations. Si un org tiene múltiples peers con distinto hash
-- (no debería, pero por si acaso), se elige el hash del agente más antiguo.
--
-- voice_agents.portal_password_hash se mantiene por retrocompat durante la
-- transición (mismo patrón que portal_token). Se dropeará en fase 4 (3-6 meses).

alter table organizations add column if not exists portal_password_hash text;

-- Backfill: primer agente con hash por portal_email
update organizations o
set portal_password_hash = (
  select va.portal_password_hash
  from voice_agents va
  where va.portal_email = o.portal_email
    and va.portal_password_hash is not null
  order by va.created_at asc
  limit 1
)
where o.portal_password_hash is null;

notify pgrst, 'reload schema';

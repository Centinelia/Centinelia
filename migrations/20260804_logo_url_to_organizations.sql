-- Backfill: organizations.logo_url ya existe como columna pero nunca fue
-- llenada consistentemente porque upload-logo/route.ts escribía solo a
-- voice_agents.logo_url por agente. Este backfill toma el primer logo_url
-- no-null de voice_agents por org y lo pone en organizations.
--
-- A partir de este commit, upload-logo escribe primero a organizations.logo_url
-- (single source of truth). voice_agents.logo_url se mantiene por
-- retrocompatibilidad hasta que decida droparse.
--
-- Ver issue-logo-url-por-agente en memoria.

update organizations o
set logo_url = (
  select va.logo_url
  from voice_agents va
  where va.portal_email = o.portal_email
    and va.logo_url is not null
  order by va.created_at asc
  limit 1
)
where o.logo_url is null;

notify pgrst, 'reload schema';

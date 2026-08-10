-- Migración a org-level portal_token
-- Ver handoff-org-portal-token-migration en memoria.
--
-- Problema: hoy cada voice_agents row tiene su propio portal_token, generando
-- N URLs válidas para acceder al mismo portal cuando la org tiene N empleados.
-- Server components hacen .eq('portal_token', token) sobre voice_agents y
-- reciben UN agente "primario", introduciendo la clase entera de bugs
-- "primary vs peer" (ver commits a45f7dea, 254912b9, 1338cc7).
--
-- Solución: portal_token vive en organizations. Una fila por portal_email,
-- una URL por cliente. Los peers dejan de existir como concepto.
--
-- Compatibilidad: voice_agents.portal_token se MANTIENE por retrocompatibilidad
-- hasta que los logs de redirect legacy en proxy.ts caigan a ~0 (release +N meses).

alter table organizations
  add column if not exists portal_token uuid not null default gen_random_uuid();

alter table organizations
  add constraint organizations_portal_token_key unique (portal_token);

create index if not exists idx_organizations_portal_token
  on organizations(portal_token);

notify pgrst, 'reload schema';

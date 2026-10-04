-- Habilita RLS en 10 tablas del schema public que quedaron sin protección
-- tras los packs 2026-09-23 (fichas informativas), 2026-09-24 (perfiles vivos)
-- y 2026-09-25 (agent tasks + rules). Detectadas por rls-coverage.test.ts el
-- 2026-10-04.
--
-- Precedente: [[feedback-rls-public-tables-default]] — toda tabla nueva en
-- public debe habilitar RLS en la misma migración. Esta migración cierra el
-- gap acumulado.
--
-- Patrón: service_role tiene BYPASSRLS, así que las rutas server-side siguen
-- funcionando sin cambios. anon/authenticated reciben 0 filas por default
-- deny — ninguna de estas tablas se consume vía anon client (grep verificado).
--   agent_rules                 — Nala/Nox rules (admin via server)
--   agent_task_runs             — bitácora de runs de tareas programadas
--   agent_tasks                 — definición de tareas programadas
--   contactos_interacciones     — perfiles vivos (server render)
--   contactos_vivos             — perfiles vivos (server render)
--   ficha_tags                  — tags de fichas informativas
--   fichas_informativas         — KB semántica por org
--   fichas_informativas_chunks  — embeddings de fichas
--   org_role_tag_additions      — tags adicionales por org/rol
--   role_default_tag_whitelist  — whitelist global de tags por rol

ALTER TABLE agent_rules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_task_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos_interacciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos_vivos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_informativas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_informativas_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_role_tag_additions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_default_tag_whitelist ENABLE ROW LEVEL SECURITY;

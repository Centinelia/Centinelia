-- Habilita RLS en 5 tablas del schema public que quedaron sin protección
-- tras la migración 20260923120500. Detectadas por el audit RLS del
-- 2026-09-30 vía admin_public_tables_rls().
--
-- Todas consumen solo service_role (createAdminClient) — cero policies
-- necesarias, misma estrategia que 20260923120500:
--   - service_role tiene BYPASSRLS → rutas API siguen leyendo/escribiendo
--   - anon/authenticated reciben 0 filas (default deny)
--
-- Verificado sin consumidores client-side:
--   agent_mailboxes_lock       — advisory lock para IMAP fetch (cron)
--   billing_pending_review     — flow de aprobación de billing (admin)
--   knowledge_base_articles    — KB interno (admin only)
--   writer_inbox_lock          — advisory lock para Nala writer (cron)
--   writer_pac_retry_state     — retry state del writer PAC (cron)

ALTER TABLE agent_mailboxes_lock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_pending_review    ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE writer_inbox_lock         ENABLE ROW LEVEL SECURITY;
ALTER TABLE writer_pac_retry_state    ENABLE ROW LEVEL SECURITY;

-- Post-migration verification queries. Ejecutar contra staging después de aplicar
-- sql/email_auto_mode.sql. Todos los assertions esperados están en comentarios.

-- 1. Verifica que las columnas existen en voice_agents
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'voice_agents' AND column_name = 'auto_mode';
-- Expected: 1 row, data_type='text', is_nullable='YES'

-- 2. Verifica constraint check en voice_agents.auto_mode
SELECT conname, consrc
FROM pg_constraint
WHERE conrelid = 'voice_agents'::regclass
  AND conname LIKE '%auto_mode%';
-- Expected: al menos 1 row con "auto_mode IN ('off','auto','always')" o similar

-- 3. Intento de insert con valor inválido debe fallar
-- (correr manualmente y verificar el error)
-- BEGIN;
-- UPDATE voice_agents SET auto_mode = 'banana' WHERE id = (SELECT id FROM voice_agents LIMIT 1);
-- ROLLBACK;
-- Expected: ERROR check constraint violation

-- 4. Verifica que auto_reply sigue existiendo (contract-first)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'voice_agents' AND column_name = 'auto_reply';
-- Expected: 1 row

-- 5. Verifica columnas en organizations
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations' AND column_name IN ('auto_mode_disabled_at','auto_mode_notified_at');
-- Expected: 2 rows

-- 6. Verifica cols en ops_inbox
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ops_inbox'
  AND column_name IN ('auto_mode_decision','auto_mode_reason','auto_mode_signals',
                      'auto_mode_flagged_at','auto_mode_flag_reason','digest_sent_at');
-- Expected: 6 rows

-- 7. Verifica tabla auto_mode_feedback_log
SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'auto_mode_feedback_log';
-- Expected: 1

-- 8. Verifica UNIQUE index para dedup
SELECT indexname FROM pg_indexes
WHERE tablename = 'ops_inbox' AND indexname = 'ops_inbox_unique_message';
-- Expected: 1 row

-- 9. Snapshot de auto_mode distribution (debe estar TODO NULL post-migration)
SELECT auto_mode, COUNT(*) FROM voice_agents GROUP BY 1;
-- Expected: solo NULL con count = total agentes

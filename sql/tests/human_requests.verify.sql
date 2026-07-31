-- Post-migration verification. Correr en Supabase SQL Editor.

-- 1. Tabla existe con 24 cols
SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'human_requests';
-- Expected: 24

-- 2. Constraints principales
SELECT conname FROM pg_constraint WHERE conrelid = 'human_requests'::regclass;
-- Expected: al menos check_source_channel, check_request_type, check_urgency, check_target_type, check_status, check_response_action

-- 3. Índices creados
SELECT indexname FROM pg_indexes WHERE tablename = 'human_requests';
-- Expected: 3 índices (agent_status, target, timeout)

-- 4. Kill switch en organizations
SELECT column_name FROM information_schema.columns
WHERE table_name = 'organizations' AND column_name = 'human_handoff_disabled_at';
-- Expected: 1 row

-- 5. source_folder en ops_inbox
SELECT column_name, column_default FROM information_schema.columns
WHERE table_name = 'ops_inbox' AND column_name = 'source_folder';
-- Expected: 1 row, default 'inbox'

-- 6. Insert con valor inválido debe fallar
-- BEGIN;
-- INSERT INTO human_requests (agent_id, source_channel, request_type, title, description, target_email, target_type)
-- VALUES ((SELECT id FROM voice_agents LIMIT 1), 'invalid_channel', 'info', 'x', 'x', 'x@x.com', 'approver');
-- ROLLBACK;
-- Expected: ERROR check constraint violation

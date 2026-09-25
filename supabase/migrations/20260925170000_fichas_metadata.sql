-- Agregar columna metadata jsonb a fichas_informativas.
--
-- Usada por el autotag retry cron (Task 6.2) para rastrear el número de
-- intentos fallidos de autotag ('autotag_retries').
--
-- Ejemplo de metadata:
--   { "autotag_retries": 2, "last_autotag_error": "autotag_timeout" }
--
-- NO aplicar via SQL Editor del dashboard (causa drift silencioso).
-- Aplicar via: supabase db push o SQL Editor + INSERT en supabase_migrations.schema_migrations.
-- Ver feedback: supabase_sql_editor_no_tracker (sesión 2026-09-23).

ALTER TABLE fichas_informativas
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

-- Índice ligero para el retry cron (busca por autotag_status='pending').
-- El índice parcial ya existe en la migration anterior; este es solo un
-- comentario de confirmación: no se re-crea aquí.

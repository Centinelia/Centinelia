-- Rename del pack `nara_fichas_tramites` a `fichas_informativas` para hacerlo
-- reutilizable en clientes que no son municipios (empresas con fichas de
-- producto, hospitales con fichas de procedimientos, etc.).
--
-- Esta migración es idempotente: si las tablas viejas ya no existen (porque
-- este ambiente arrancó desde cero con las migraciones nuevas), no hace nada.
-- Si existen (ambiente que ya había corrido las migraciones originales), las
-- renombra al nombre nuevo.

DO $$
BEGIN
  -- 1. Rename tablas si existen con los nombres viejos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nara_fichas_tramites') THEN
    ALTER TABLE nara_fichas_tramites RENAME TO fichas_informativas;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nara_ficha_chunks') THEN
    ALTER TABLE nara_ficha_chunks RENAME TO fichas_informativas_chunks;
  END IF;

  -- 2. Rename índices
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nara_fichas_portal_email') THEN
    ALTER INDEX idx_nara_fichas_portal_email RENAME TO idx_fichas_informativas_portal_email;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nara_chunks_ficha') THEN
    ALTER INDEX idx_nara_chunks_ficha RENAME TO idx_fichas_chunks_ficha;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nara_chunks_portal_email') THEN
    ALTER INDEX idx_nara_chunks_portal_email RENAME TO idx_fichas_chunks_portal_email;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nara_chunks_embedding') THEN
    ALTER INDEX idx_nara_chunks_embedding RENAME TO idx_fichas_chunks_embedding;
  END IF;

  -- 3. Rename trigger + function
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_nara_fichas_updated_at') THEN
    ALTER TRIGGER trg_nara_fichas_updated_at ON fichas_informativas RENAME TO trg_fichas_informativas_updated_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'nara_fichas_touch_updated_at') THEN
    ALTER FUNCTION nara_fichas_touch_updated_at() RENAME TO fichas_informativas_touch_updated_at;
  END IF;
END$$;

-- 4. Refrescar la RPC para que apunte a la tabla renombrada (idempotente)
CREATE OR REPLACE FUNCTION match_ficha_chunks(
  query_embedding vector(1536),
  portal_email_filter TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id      UUID,
  ficha_id      UUID,
  chunk_index   INT,
  section_type  TEXT,
  content       TEXT,
  token_count   INT,
  similarity    FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.ficha_id,
    c.chunk_index,
    c.section_type,
    c.content,
    c.token_count,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity
  FROM fichas_informativas_chunks c
  WHERE c.portal_email = portal_email_filter
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. Crear bucket nuevo (los buckets no se pueden renombrar en Supabase Storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fichas-informativas', 'fichas-informativas', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 6. Migrar feature flags en organizations (rename keys)
UPDATE organizations
SET features = (features - 'fichas_tramites' - 'fichas_tramites_mode')
             || jsonb_build_object(
                  'fichas_informativas',      COALESCE(features->'fichas_tramites',      'false'::jsonb),
                  'fichas_informativas_mode', COALESCE(features->'fichas_tramites_mode', '"stuffed"'::jsonb)
                )
WHERE features ? 'fichas_tramites' OR features ? 'fichas_tramites_mode';

-- 7. Migrar feature flags en voice_agents
UPDATE voice_agents
SET features = (features - 'fichas_tramites')
             || jsonb_build_object('fichas_informativas', COALESCE(features->'fichas_tramites', 'false'::jsonb))
WHERE features ? 'fichas_tramites';

-- 8. Actualizar storage_path para apuntar al bucket nuevo (mismo path relativo)
-- Nota: los archivos físicos siguen en el bucket viejo hasta que un job los mueva.
-- Storage move es manual desde el API server-side (ver script post-deploy).
-- No cambiamos storage_path aquí para no dejar rows apuntando a archivos que
-- no existen todavía; el paso de mover los archivos + reapuntar storage_path
-- se hace desde un script una sola vez tras el deploy.

-- Fix round 1 para Fase 4: tighten filter RPC + tsvector ranked RPC
--
-- C1: Elimina cláusulas OR tags IS NULL / OR tags = '{}' del RPC match_ficha_chunks_filtered.
--     Esas cláusulas hacían pasar fichas en estado 'pending' (tags vacío) sin respetar
--     la whitelist, enmascarando el fallback cuando la whitelist estaba vacía.
--     Ahora solo pasan:
--       - fichas cuyo tags && p_effective_whitelist  (al menos un tag en whitelist)
--       - fichas con tags = ARRAY['_untagged_']      (fichas legacy sin autotag)
--     Si whitelist está vacía, tags && '{}' nunca es true → devuelve 0 fichas.
--     El caller TypeScript detecta 0 resultados y hace fallback a match_ficha_chunks sin filtro.
--
-- C2: Agrega tsvector_search_fichas_chunks con orden por ts_rank DESC.
--     Reemplaza el .textSearch() del SDK JS que no expone ordering por relevancia.
--
-- I1: Index GIN sobre fichas_informativas.tags (idempotente IF NOT EXISTS).
--     Prerequisito: ya fue creado en 20260924130300_alter_fichas_informativas_tags.sql.
--     Se repite aquí como salvaguarda de idempotencia — IF NOT EXISTS garantiza no-op
--     si ya existe, por lo que es seguro reejecutar.
--     Sin este index, el filtro tags && p_effective_whitelist hace seq scan.

-- I1: Index GIN idempotente
CREATE INDEX IF NOT EXISTS fichas_informativas_tags_idx
  ON fichas_informativas USING GIN (tags);

-- C1: Reemplazar match_ficha_chunks_filtered sin las cláusulas OR tags IS NULL / OR tags = '{}'
-- Comportamiento corregido:
--   - Fichas cuyo tags && p_effective_whitelist → candidatas
--   - Fichas cuyo tags = '{_untagged_}' → candidatas (fichas legacy antes del autotag)
--   - Fichas con tags = NULL o tags = '{}' (estado 'pending') → EXCLUIDAS.
--     Si el caller quiere incluirlas, debe usar match_ficha_chunks sin filtro.
--   - autotag_status IN ('done','manual_override','untagged_legacy','error') sigue requerido.
--   - Si p_effective_whitelist está vacío, tags && '{}' nunca es true, por lo que
--     solo fichas con _untagged_ pasan → resultado probablemente vacío → caller hace fallback.
CREATE OR REPLACE FUNCTION match_ficha_chunks_filtered(
  p_portal_email        TEXT,
  p_query_embedding     vector(1536),
  p_effective_whitelist TEXT[],
  p_limit               INT DEFAULT 15
)
RETURNS TABLE (
  chunk_id     UUID,
  ficha_id     UUID,
  chunk_index  INT,
  section_type TEXT,
  content      TEXT,
  token_count  INT,
  similarity   FLOAT,
  tags         TEXT[]
)
LANGUAGE SQL STABLE
AS $$
  WITH candidate_fichas AS (
    SELECT id
    FROM fichas_informativas
    WHERE portal_email = p_portal_email
      AND autotag_status IN ('done', 'manual_override', 'untagged_legacy', 'error')
      AND (
        -- Pasa si comparte al menos un tag con la whitelist efectiva
        tags && p_effective_whitelist
        -- O si está marcada explícitamente como sin tags (fichas legacy antes del autotag)
        OR tags = ARRAY['_untagged_']::TEXT[]
        -- Fichas con tags IS NULL o tags = '{}' (estado pending) NO pasan.
        -- El caller TypeScript debe detectar 0 resultados y hacer fallback a
        -- match_ficha_chunks sin filtro para incluirlas.
      )
  )
  SELECT
    c.id          AS chunk_id,
    c.ficha_id,
    c.chunk_index,
    c.section_type,
    c.content,
    c.token_count,
    1 - (c.embedding <=> p_query_embedding) AS similarity,
    f.tags
  FROM fichas_informativas_chunks c
  JOIN fichas_informativas f ON f.id = c.ficha_id
  WHERE c.ficha_id IN (SELECT id FROM candidate_fichas)
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

-- C2: RPC de full-text search ordenado por ts_rank.
-- Reemplaza el uso de .textSearch() del SDK Supabase JS (que no expone ts_rank ordering).
-- Retorna chunks ordenados por relevancia textual descendente.
-- Parámetros:
--   p_portal_email  TEXT — scope de organización
--   p_query         TEXT — texto libre de la búsqueda
--   p_limit         INT  — máximo de resultados
CREATE OR REPLACE FUNCTION tsvector_search_fichas_chunks(
  p_portal_email  TEXT,
  p_query         TEXT,
  p_limit         INT DEFAULT 15
)
RETURNS TABLE (
  id       UUID,
  content  TEXT,
  ficha_id UUID,
  titulo   TEXT,
  rank     FLOAT4
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    c.id,
    c.content,
    c.ficha_id,
    f.titulo,
    ts_rank(
      to_tsvector('spanish', c.content),
      plainto_tsquery('spanish', p_query)
    ) AS rank
  FROM fichas_informativas_chunks c
  JOIN fichas_informativas f ON f.id = c.ficha_id
  WHERE f.portal_email = p_portal_email
    AND to_tsvector('spanish', c.content) @@ plainto_tsquery('spanish', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

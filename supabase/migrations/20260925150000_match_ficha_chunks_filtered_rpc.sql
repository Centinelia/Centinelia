-- Fase 4: RPC match_ficha_chunks_filtered
-- Combina pre-filtro por tag whitelist (Paso 1) y búsqueda semántica HNSW (Paso 2)
-- en una sola query eficiente con CTE.
--
-- Parámetros:
--   p_portal_email        TEXT   — organización propietaria de las fichas
--   p_query_embedding     vector — embedding 1536 de la query del meerkat
--   p_effective_whitelist TEXT[] — whitelist efectiva del rol (puede ser vacía, nunca NULL)
--   p_limit               INT    — top-K a devolver
--
-- Comportamiento de filtro:
--   - Fichas cuyo tags && p_effective_whitelist → candidatas
--   - Fichas cuyo tags = '{_untagged_}' → candidatas (legacy / sin autotag)
--   - Fichas con autotag_status IN ('done','manual_override','untagged_legacy','error') → candidatas
--   - Si p_effective_whitelist está vacío, la condición tags && '{}' nunca es true,
--     por lo que solo pasan fichas con _untagged_. El caller (TypeScript) debe
--     detectar 0 resultados y hacer fallback a match_ficha_chunks sin filtro.
--
-- Diferencia con match_ficha_chunks:
--   - Agrega el JOIN y el filtro por tags.
--   - Devuelve los mismos campos que match_ficha_chunks más f.tags para diagnóstico.

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
        -- O si está marcada como sin tags (fichas legacy antes del autotag)
        OR tags = ARRAY['_untagged_']::TEXT[]
        -- O si no tiene tags asignados aún (NULL o array vacío)
        OR tags IS NULL
        OR tags = '{}'::TEXT[]
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

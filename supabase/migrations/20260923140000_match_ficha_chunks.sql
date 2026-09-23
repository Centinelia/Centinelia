-- RPC para búsqueda vectorial de chunks de fichas por similitud coseno.
--
-- Uso desde el cliente (supabase-js):
--   const { data } = await sb.rpc('match_ficha_chunks', {
--     query_embedding: embedding,           -- vector(1536)
--     portal_email_filter: 'santiago-dev@centinelia.mx',
--     match_count: 5,
--   });
--
-- Devuelve top-K chunks con su similitud, ordenados por proximidad al query.
-- El filtro por portal_email es multitenant safety: un meerkat de Santiago
-- nunca ve fichas de otra org aunque comparta pgvector index.

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

COMMENT ON FUNCTION match_ficha_chunks IS
  'Top-K vector search sobre fichas_informativas_chunks filtrado por portal_email. Cosine distance con HNSW index.';

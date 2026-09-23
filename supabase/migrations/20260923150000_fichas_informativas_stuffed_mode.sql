-- Modo dual para el pack fichas_informativas.
--
-- Contexto: para volumen bajo (20-60 fichas cortas), el approach RAG con
-- embeddings agrega un proveedor externo (OpenAI) sin ganancia de calidad;
-- Anthropic caching sobre el catálogo completo funciona igual de bien y sin
-- agregar keys/facturación.
--
-- Diseño: `organizations.features.fichas_informativas_mode`:
--   'stuffed'    → default. El tool devuelve TODAS las fichas del portal,
--                  el meerkat elige la relevante en su razonamiento (con
--                  Anthropic caching). NO requiere OPENAI_API_KEY.
--   'embeddings' → para volumen grande (100+ fichas o docs de 30+ páginas).
--                  Usa pgvector + búsqueda semántica. Requiere OPENAI_API_KEY.
--
-- La infra de embeddings (pgvector, tabla chunks, RPC) se conserva latente.
-- Cuando un cliente crezca, se cambia el mode y se corre el ingest embeddings.
--
-- Nota: la migración base 20260923120000 ya crea embedding como NULLABLE, así
-- que este ALTER es idempotente en fresh installs. Se conserva por si un
-- ambiente estaba en un estado intermedio.

ALTER TABLE fichas_informativas_chunks
  ALTER COLUMN embedding DROP NOT NULL;

COMMENT ON COLUMN fichas_informativas_chunks.embedding IS
  'Embedding OpenAI text-embedding-3-small (1536 dim). NULLABLE porque en modo stuffed las secciones se guardan sin vector (el meerkat lee el catálogo completo con caching).';

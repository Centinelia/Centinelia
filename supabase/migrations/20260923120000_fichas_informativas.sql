-- Pack fichas_informativas — RAG (o catálogo stuffed con Anthropic caching)
-- sobre las fichas informativas de un negocio. Casos de uso:
--   - Municipios: fichas técnicas de trámites (Predial, Multas, ISAI, licencias)
--   - Empresas: fichas de producto, servicio, procedimientos internos
--   - Hospitales, escuelas, etc.: cualquier documentación estructurada
--
-- Diseño:
--   - Bucket privado `fichas-informativas` para PDFs originales.
--   - Tabla `fichas_informativas`: 1 row por ficha con contactos extraídos a
--     columnas para engarzar con cascada de transferencias.
--   - Tabla `fichas_informativas_chunks`: N rows por ficha con opcional
--     embedding OpenAI text-embedding-3-small (1536 dim, cosine) para modo RAG.
--   - Índice HNSW para búsqueda vectorial < 50ms.
--   - Feature flag `fichas_informativas` en `organizations.features`.
--   - Modo controlado por `organizations.features.fichas_informativas_mode`
--     ('stuffed' default = catálogo completo, 'embeddings' = RAG semántico).
--
-- Convención Centinelia: las FKs a organizations van por `portal_email TEXT`.

-- 1. pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Bucket privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fichas-informativas',
  'fichas-informativas',
  false,
  20971520, -- 20 MB por archivo
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Tabla de fichas (1 row = 1 ficha)
CREATE TABLE IF NOT EXISTS fichas_informativas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email          TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  codigo                TEXT NOT NULL,
  titulo                TEXT NOT NULL,
  dependencia           TEXT,
  unidad_administrativa TEXT,
  contacto_nombre       TEXT,
  contacto_puesto       TEXT,
  contacto_correo       TEXT,
  contacto_telefono     TEXT,
  contacto_extension    TEXT,
  liga_en_linea         TEXT,
  direccion             TEXT,
  horario               TEXT,
  costo_descripcion     TEXT,
  plazo_respuesta       TEXT,
  storage_path          TEXT NOT NULL,
  file_hash             TEXT,
  raw_text              TEXT,
  parsed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_email, codigo)
);

CREATE INDEX IF NOT EXISTS idx_fichas_informativas_portal_email
  ON fichas_informativas(portal_email);

COMMENT ON TABLE fichas_informativas IS
  'Fichas informativas de un negocio (trámites, productos, servicios, procedimientos). Contactos extraídos a columnas para engarzar con cascada de transferencias.';

-- 4. Tabla de chunks
CREATE TABLE IF NOT EXISTS fichas_informativas_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id      UUID NOT NULL REFERENCES fichas_informativas(id) ON DELETE CASCADE,
  portal_email  TEXT NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  section_type  TEXT NOT NULL,
  content       TEXT NOT NULL,
  token_count   INT,
  embedding     vector(1536),
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ficha_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_fichas_chunks_ficha
  ON fichas_informativas_chunks(ficha_id);

CREATE INDEX IF NOT EXISTS idx_fichas_chunks_portal_email
  ON fichas_informativas_chunks(portal_email);

CREATE INDEX IF NOT EXISTS idx_fichas_chunks_embedding
  ON fichas_informativas_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE fichas_informativas_chunks IS
  'Chunks semánticos de fichas con embedding opcional OpenAI (1536 dim, cosine). NULLABLE en modo stuffed.';

COMMENT ON COLUMN fichas_informativas_chunks.embedding IS
  'Embedding OpenAI text-embedding-3-small (1536 dim). NULLABLE en modo stuffed.';

-- 5. Trigger updated_at
CREATE OR REPLACE FUNCTION fichas_informativas_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fichas_informativas_updated_at ON fichas_informativas;
CREATE TRIGGER trg_fichas_informativas_updated_at
  BEFORE UPDATE ON fichas_informativas
  FOR EACH ROW EXECUTE FUNCTION fichas_informativas_touch_updated_at();

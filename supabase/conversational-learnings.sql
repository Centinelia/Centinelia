-- conversational-learnings: motor de mejora conversacional global de Centinelia
-- Los aprendizajes de estilo conversacional aplican a TODOS los agentes de la plataforma.
-- Correr después de las migraciones base.

-- Columna CES en voice_calls
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS ces_data JSONB;
CREATE INDEX IF NOT EXISTS voice_calls_ces_idx ON voice_calls((ces_data->>'overall')) WHERE ces_data IS NOT NULL;

-- Tabla de aprendizajes conversacionales globales
CREATE TABLE IF NOT EXISTS conversational_learnings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  body         text        NOT NULL,
  dimension    text        CHECK (dimension IN ('fluidez','comprension','naturalidad','conduccion','confianza','resolucion')),
  source_count int         NOT NULL DEFAULT 1,
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','active','rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz,
  approved_by  text
);

CREATE INDEX IF NOT EXISTS cl_status_idx    ON conversational_learnings(status);
CREATE INDEX IF NOT EXISTS cl_created_idx   ON conversational_learnings(created_at DESC);

ALTER TABLE conversational_learnings ENABLE ROW LEVEL SECURITY;

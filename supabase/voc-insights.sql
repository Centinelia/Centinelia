-- voc-insights: Voice of Customer extractions per organization
-- Los meerkats (Nox, Niva, Sofia, Nia, etc.) pueden llamar extraer_voz_del_cliente
-- para extraer lenguaje real de clientes, objeciones frecuentes y candidatos de headline.
-- Los resultados se guardan aquí para revisión histórica y para alimentar Iniciativa / marketing.

CREATE TABLE IF NOT EXISTS voc_insights (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  text        NOT NULL,
  source        text        NOT NULL CHECK (source IN ('calls','emails','tickets','all')),
  window_days   int         NOT NULL DEFAULT 30,
  sample_count  int         NOT NULL,
  phrases           jsonb   NOT NULL DEFAULT '[]',
  objections        jsonb   NOT NULL DEFAULT '[]',
  retention_reasons jsonb   NOT NULL DEFAULT '[]',
  churn_reasons     jsonb   NOT NULL DEFAULT '[]',
  headline_candidates jsonb NOT NULL DEFAULT '[]',
  summary       text        NOT NULL,
  requested_by  uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Ensure the source CHECK includes 'all' even when the table pre-exists from an
-- earlier version (CREATE TABLE IF NOT EXISTS skips the check clause).
ALTER TABLE voc_insights DROP CONSTRAINT IF EXISTS voc_insights_source_check;
ALTER TABLE voc_insights ADD CONSTRAINT voc_insights_source_check
  CHECK (source IN ('calls','emails','tickets','all'));

CREATE INDEX IF NOT EXISTS voc_insights_portal_idx  ON voc_insights(portal_email, created_at DESC);
CREATE INDEX IF NOT EXISTS voc_insights_source_idx  ON voc_insights(source);

ALTER TABLE voc_insights ENABLE ROW LEVEL SECURITY;

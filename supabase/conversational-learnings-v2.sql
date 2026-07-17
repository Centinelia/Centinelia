-- Agrega target_document a conversational_learnings
-- Indica qué documento enriquece cada propuesta de aprendizaje.
-- ADN nunca es target — solo CCE o HCP.

ALTER TABLE conversational_learnings
  ADD COLUMN IF NOT EXISTS target_document text
  NOT NULL DEFAULT 'hcp'
  CHECK (target_document IN ('cce', 'hcp'));

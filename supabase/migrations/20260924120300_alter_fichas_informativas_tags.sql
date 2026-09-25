-- Agregar tags + autotag_status a fichas_informativas (pack shipped 2026-09-23).
-- Ver docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Sección 4.7.

ALTER TABLE fichas_informativas
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN autotag_status text NOT NULL DEFAULT 'pending'
    CHECK (autotag_status IN ('pending', 'done', 'manual_override', 'untagged_legacy', 'error'));

CREATE INDEX fichas_informativas_tags_idx ON fichas_informativas USING GIN (tags);
CREATE INDEX fichas_informativas_autotag_pending_idx
  ON fichas_informativas (portal_email, autotag_status)
  WHERE autotag_status != 'done';

-- Marcar fichas existentes como legacy pendientes de backfill de tags.
-- Estas fichas participan del retrieval sin filtro (tags = '{_untagged_}') hasta que
-- el backfill worker (Fase 6) las procese.
UPDATE fichas_informativas
SET autotag_status = 'untagged_legacy',
    tags = ARRAY['_untagged_']
WHERE autotag_status = 'pending' AND tags = '{}';

COMMENT ON COLUMN fichas_informativas.tags IS
  'Tags del catálogo ficha_tags. Fichas legacy sin backfill tienen tags=[_untagged_].';
COMMENT ON COLUMN fichas_informativas.autotag_status IS
  'Estado del autotag Sonnet. pending=recién creada. done=procesada. manual_override=cliente modificó. untagged_legacy=pre-migración. error=falló 3 veces.';

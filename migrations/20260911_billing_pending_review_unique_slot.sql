-- 2026-09-11 — Unique index en billing_pending_review para cerrar race condition.
--
-- Contexto: excel-flow (tortilleria + ramon-leang) hace un SELECT para verificar
-- si ya insertaron rows del emailId, y si no, procede a INSERT. Sin lock, dos
-- workers concurrentes pueden ambos pasar el check y ambos insertar duplicados
-- (2×6 CFDIs = 12 XMLs a Dropbox / CONTPAQi).
--
-- Fix: unique index sobre el slot lógico (portal_email, email_id, image_index,
-- remision_index). Usamos NULLS NOT DISTINCT (Postgres 15+) para tratar NULL
-- como valor comparable — atrapa el caso ramon-leang que siempre pasa
-- image_index=NULL.
--
-- Post-migración el código puede usar upsert(rows, { onConflict, ignoreDuplicates })
-- y confiar en que solo 1 worker gana.

DO $$
BEGIN
  -- Postgres 15+: unique index con NULLS NOT DISTINCT trata NULL como valor
  -- comparable (dos rows con misma tupla + NULL en image_index colisionan).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uniq_billing_pending_review_email_slot'
  ) THEN
    CREATE UNIQUE INDEX uniq_billing_pending_review_email_slot
      ON billing_pending_review (portal_email, email_id, image_index, remision_index)
      NULLS NOT DISTINCT;
  END IF;
END$$;

COMMENT ON INDEX uniq_billing_pending_review_email_slot IS
  'Cierra race condition en excel-flow ramon-leang y tortilleria. Dos workers ' ||
  'concurrentes ya no pueden crear duplicados del mismo (email, slot).';

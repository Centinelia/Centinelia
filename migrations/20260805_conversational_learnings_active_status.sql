-- Fix: producción tiene el constraint viejo sin 'active'.
-- El código UI y ces-eval.ts usan 'active' para marcar aprendizajes inyectados en prompts.
-- Correr en Supabase SQL editor.

ALTER TABLE conversational_learnings
  DROP CONSTRAINT IF EXISTS conversational_learnings_status_check;

ALTER TABLE conversational_learnings
  ADD CONSTRAINT conversational_learnings_status_check
  CHECK (status IN ('pending', 'approved', 'active', 'rejected'));

-- Flag org-level para modo supervisado real: cuando true, TODA delegación de
-- agente pasa por plan approval humano (email con magic link) sin importar
-- tamaño ni keywords de la tarea.
--
-- Precedence con auto_approve_task_plans:
--   auto_approve_task_plans=true  → SIEMPRE auto-aprueba (skip)
--   always_approve_delegations=true → SIEMPRE requiere approval
--   ambos false → threshold por tamaño/keywords (default)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS always_approve_delegations BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN organizations.always_approve_delegations IS
  'Si true, delegar_tarea siempre requiere plan approval del dueño (modo supervisado real).';

-- Audit trail de activaciones/desactivaciones de módulos por org.
-- Cada POST a /api/portal/[token]/modules registra la acción aquí.
-- Necesario para:
--   1) Debugging: "¿cuándo activó Beatriz Facturación a clientes?"
--   2) Facturación: cobrar el mes proporcional desde el día de activación.
--   3) Detección de patrones: módulos que se activan y desactivan seguido
--      indican mala UX o expectativa desalineada.
CREATE TABLE IF NOT EXISTS module_activations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  text        NOT NULL REFERENCES organizations(portal_email) ON DELETE CASCADE,
  module_id     text        NOT NULL,
  action        text        NOT NULL CHECK (action IN ('activate', 'deactivate')),
  actor_email   text        NOT NULL,
  actor_source  text        NOT NULL DEFAULT 'portal',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_activations_portal_email_idx
  ON module_activations(portal_email, created_at DESC);

CREATE INDEX IF NOT EXISTS module_activations_module_id_idx
  ON module_activations(module_id, created_at DESC);

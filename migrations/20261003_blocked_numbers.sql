-- blocked_numbers — números telefónicos que el dueño del negocio quiere
-- rechazar en voz entrante (spam, bots marcadores, acosadores).
--
-- Motivación: Tortillería Estrella recibió 20 llamadas en pocas horas desde
-- un marcador automático (+524812092229) el 2026-10-03. Ramón pidió herramienta
-- para que el cliente final pueda bloquear números por sí mismo sin esperar
-- intervención manual.
--
-- Chequeo vive en src/app/api/voice/inbound/route.ts: tras resolver el agent,
-- antes del account_status check. Si el (portal_email, phoneNumber) está
-- bloqueado, el endpoint devuelve 403 y Vapi cuelga en <1s sin consumir pool
-- (mismo patrón que `account suspended`).
--
-- Scope org-level (portal_email), no per-agent — ver
-- [[feedback-portal-token-org-level]] y [[feedback-integraciones-org-level]].
-- Si una org tiene varios meerkats, el bloqueo aplica a todos.

CREATE TABLE IF NOT EXISTS blocked_numbers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  TEXT        NOT NULL,
  phone_e164    TEXT        NOT NULL,
  reason        TEXT,                                    -- opcional, p.ej. "bot marcador"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT,                                    -- portal_email del que bloqueó, o 'admin:<email>' si fue Nazre

  CONSTRAINT blocked_numbers_phone_e164_format CHECK (phone_e164 ~ '^\+[0-9]{7,15}$'),
  CONSTRAINT blocked_numbers_unique UNIQUE (portal_email, phone_e164)
);

COMMENT ON TABLE  blocked_numbers IS 'Números bloqueados por org para llamadas entrantes (voz). Chequeado en inbound/route.ts.';
COMMENT ON COLUMN blocked_numbers.phone_e164   IS 'Número en formato E.164 con + y código de país. Normalizado via normalizeToE164.';
COMMENT ON COLUMN blocked_numbers.reason       IS 'Razón libre, para auditoría. Opcional.';
COMMENT ON COLUMN blocked_numbers.created_by   IS 'portal_email del owner o "admin:<nazre_email>" si fue soporte interno.';

CREATE INDEX IF NOT EXISTS idx_blocked_numbers_lookup
  ON blocked_numbers (portal_email, phone_e164);

-- RLS: solo service role lee/escribe. UI usa admin client vía API portal con
-- resolveOrgFromToken, que ya enforza scoping por portal_email (patrón IDOR).
-- Ver [[feedback-rls-public-tables-default]].
ALTER TABLE blocked_numbers ENABLE ROW LEVEL SECURITY;

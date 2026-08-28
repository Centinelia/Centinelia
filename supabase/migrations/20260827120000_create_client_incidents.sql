-- =============================================================================
-- Migration: 20260827120000_create_client_incidents.sql
-- Module:    Incidencias para Tortillería (bitácora de incidentes del cliente)
--
-- Tabla para registrar incidencias en el flujo de tortillería:
--   - fuente: llamada de cliente (inbound call) o entrada manual
--   - seguimiento: correo a encargado, visita de verificación, resultado
--   - estado: pendiente → contactado → visitado → resuelto
--
-- Aplicable al piloto Tortillería Estrella (portal_email: piloto-estrella@centinelia.mx).
-- Ver [[handoff-noah-flow-tortilleria-2026-08-27]] + [[project-centinelia-pilot-tortilleria-estrella-nia]].
-- =============================================================================

CREATE TABLE IF NOT EXISTS client_incidents (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                  UUID NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  portal_email              TEXT NOT NULL,

  business_name             TEXT NOT NULL,
  contact_name              TEXT,
  contact_phone             TEXT NOT NULL,
  address                   TEXT NOT NULL,
  motivo                    TEXT NOT NULL,

  source_channel            TEXT NOT NULL,
  source_call_id            UUID REFERENCES voice_calls(id),
  is_new_client             BOOLEAN NOT NULL DEFAULT false,

  encargado_email           TEXT,
  encargado_name            TEXT,
  email_sent_at             TIMESTAMPTZ,
  email_confirmed_at        TIMESTAMPTZ,

  verification_scheduled_at TIMESTAMPTZ NOT NULL,
  verification_outbound_id  UUID REFERENCES outbound_contacts(id),
  verification_called_at    TIMESTAMPTZ,
  verification_result       TEXT CHECK (verification_result IN ('ok','no_visitado','sin_respuesta')),
  verification_result_notes TEXT,

  vendedor                  TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice compuesto agent + fecha: consultas por agente en un período
CREATE INDEX IF NOT EXISTS idx_client_incidents_agent_created
  ON client_incidents(agent_id, created_at DESC);

-- Índice para buscar incidencias pendientes de verificación
CREATE INDEX IF NOT EXISTS idx_client_incidents_verification_pending
  ON client_incidents(verification_scheduled_at)
  WHERE verification_result IS NULL;

-- Índice compuesto portal + fecha: consultas por portal_email (multi-tenant)
CREATE INDEX IF NOT EXISTS idx_client_incidents_portal_email_created
  ON client_incidents(portal_email, created_at DESC);

-- =============================================================================
-- NOTAS DE DISEÑO
-- =============================================================================
--
-- 1. agent_id: FK con ON DELETE CASCADE. Si el empleado (meerkat) se elimina,
--    los incidentes se borran. Comportamiento esperado para pilotos.
--
-- 2. source_call_id, verification_outbound_id: FK sin ON DELETE especificado
--    → default NO ACTION. Las llamadas/contactos de salida son inmutables
--    para audit; si se borran, es error intencional que bloquea.
--
-- 3. verification_result: enum cerrado (ok | no_visitado | sin_respuesta).
--    NULL = pendiente. Otros estados futuros se agregan con migración nueva.
--
-- 4. portal_email: no tiene FK a organizations(portal_email) por patrón del
--    proyecto (validación a nivel aplicación). Ver expedientes_compras para
--    el mismo patrón.
--
-- 5. updated_at: se puede poblar vía trigger en futuro si es necesario.
--    Por ahora, la aplicación lo maneja en UPDATE statements.
-- =============================================================================

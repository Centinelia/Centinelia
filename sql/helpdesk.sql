-- IT Helpdesk — Mesa de ayuda + Incidentes activos
-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid        NOT NULL,
  folio         text        NOT NULL,
  caller_number text,
  categoria     text        NOT NULL DEFAULT 'otro',   -- red | servidores | usuario | software | hardware | accesos | otro
  prioridad     text        NOT NULL DEFAULT 'normal', -- baja | normal | alta | critica
  titulo        text        NOT NULL,
  descripcion   text,
  asignado_a    text,
  asignado_tel  text,
  status        text        NOT NULL DEFAULT 'abierto', -- abierto | en_proceso | pendiente | resuelto | cerrado
  resolucion    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folio)
);

CREATE INDEX IF NOT EXISTS helpdesk_tickets_agent_id ON helpdesk_tickets (agent_id);
CREATE INDEX IF NOT EXISTS helpdesk_tickets_status   ON helpdesk_tickets (status);

CREATE TABLE IF NOT EXISTS it_incidents (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid        NOT NULL,
  titulo      text        NOT NULL,
  descripcion text        NOT NULL,
  mensaje_voz text        NOT NULL,  -- lo que el agente dice al contestar
  keywords    text[]      NOT NULL DEFAULT '{}',
  activo      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS it_incidents_agent_id ON it_incidents (agent_id);
CREATE INDEX IF NOT EXISTS it_incidents_activo   ON it_incidents (activo);

ALTER TABLE helpdesk_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON helpdesk_tickets USING (false) WITH CHECK (false);

ALTER TABLE it_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON it_incidents USING (false) WITH CHECK (false);

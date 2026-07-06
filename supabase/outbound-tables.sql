-- Outbound calling tables — run in Supabase SQL Editor

ALTER TABLE voice_agents ADD COLUMN IF NOT EXISTS vapi_phone_number_id text;

CREATE TABLE IF NOT EXISTS outbound_contacts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid        NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  nombre       text,
  telefono     text        NOT NULL,
  motivo       text,
  scheduled_at timestamptz,
  status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_contacts_agent_status_idx
  ON outbound_contacts(agent_id, status);

CREATE INDEX IF NOT EXISTS outbound_contacts_scheduled_idx
  ON outbound_contacts(scheduled_at, status) WHERE scheduled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS outbound_calls (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid        NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  contact_id   uuid        REFERENCES outbound_contacts(id) ON DELETE SET NULL,
  telefono     text        NOT NULL,
  nombre       text,
  motivo       text,
  vapi_call_id text        UNIQUE,
  status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'calling', 'answered', 'no_answer', 'completed', 'failed')),
  called_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_calls_contact_idx ON outbound_calls(contact_id);
CREATE INDEX IF NOT EXISTS outbound_calls_agent_idx   ON outbound_calls(agent_id);

-- WhatsApp appointments (needed by the WA webhook, references voice_agents)
CREATE TABLE IF NOT EXISTS wa_appointments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         uuid        NOT NULL REFERENCES voice_agents(id) ON DELETE CASCADE,
  customer_number  text        NOT NULL,
  nombre           text,
  servicio         text,
  fecha            text,
  hora             text,
  notas            text,
  status           text        NOT NULL DEFAULT 'confirmada'
                                 CHECK (status IN ('confirmada', 'cancelada', 'completada')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_appointments_agent_idx ON wa_appointments(agent_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- CentinelIA — Fase 2: Outbound Schema
-- Run AFTER the main schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Add starts_at to appointments_voice so the cron can trigger reminders
ALTER TABLE appointments_voice ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE appointments_voice ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false;

-- Add vapi_phone_number_id to voice_agents for outbound calls
-- This is the Vapi phone registry ID (different from the Twilio number)
ALTER TABLE voice_agents ADD COLUMN IF NOT EXISTS vapi_phone_number_id text;

-- Link a WhatsApp agent to a voice agent so WA-booked appointments can get reminder calls
ALTER TABLE whatsapp_agents ADD COLUMN IF NOT EXISTS voice_agent_id uuid references voice_agents(id) on delete set null;

-- WhatsApp appointments: booked via Claude tool use in the WA webhook
create table if not exists wa_appointments (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references whatsapp_agents(id) on delete cascade,
  voice_agent_id   uuid references voice_agents(id) on delete set null,
  customer_number  text not null,
  nombre           text,
  servicio         text,
  fecha            text,
  hora             text,
  notas            text,
  status           text not null default 'confirmada'
                     check (status in ('confirmada', 'cancelada', 'completada')),
  starts_at        timestamptz,
  reminder_sent    boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists wa_appointments_agent_idx on wa_appointments(agent_id);
create index if not exists wa_appointments_reminder_idx
  on wa_appointments(starts_at, reminder_sent) where reminder_sent = false;

-- Outbound contacts: manual lists uploaded via CSV or portal
create table if not exists outbound_contacts (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references voice_agents(id) on delete cascade,
  nombre        text,
  telefono      text not null,
  motivo        text,
  scheduled_at  timestamptz not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'calling', 'completed', 'failed', 'cancelled')),
  created_at    timestamptz not null default now()
);

create index if not exists outbound_contacts_status_scheduled_idx
  on outbound_contacts(status, scheduled_at);
create index if not exists outbound_contacts_agent_idx
  on outbound_contacts(agent_id);

-- Outbound call log: one row per call attempt
create table if not exists outbound_calls (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid not null references voice_agents(id) on delete cascade,
  contact_id        uuid references outbound_contacts(id),
  appointment_id    uuid,
  telefono          text not null,
  nombre            text,
  motivo            text,
  vapi_call_id      text unique,
  status            text not null default 'pending'
                      check (status in ('pending', 'calling', 'answered', 'no_answer', 'completed', 'failed')),
  outcome           text check (outcome in ('confirmed', 'cancelled', 'rescheduled', 'no_answer', 'voicemail', 'other')),
  attempt           integer not null default 1,
  next_retry_at     timestamptz,
  wa_fallback_sent  boolean not null default false,
  scheduled_at      timestamptz not null,
  called_at         timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists outbound_calls_status_scheduled_idx
  on outbound_calls(status, scheduled_at);
create index if not exists outbound_calls_next_retry_idx
  on outbound_calls(next_retry_at) where next_retry_at is not null;
create index if not exists outbound_calls_agent_idx
  on outbound_calls(agent_id);
create index if not exists outbound_calls_vapi_call_id_idx
  on outbound_calls(vapi_call_id);

-- ── WhatsApp Broadcasts ───────────────────────────────────────────────────────
-- Campaigns that send a message to a list of contacts.
-- Supports {{nombre}} variable in the message body.
-- Note: Twilio rejects first-contact messages without an approved Meta template.

create table if not exists wa_broadcasts (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references whatsapp_agents(id) on delete cascade,
  message      text not null,
  scheduled_at timestamptz not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'sending', 'completed', 'cancelled')),
  total        integer not null default 0,
  sent         integer not null default 0,
  failed       integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists wa_broadcasts_status_scheduled_idx
  on wa_broadcasts(status, scheduled_at);

create table if not exists wa_broadcast_recipients (
  id           uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references wa_broadcasts(id) on delete cascade,
  nombre       text,
  telefono     text not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'sent', 'failed')),
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists wa_broadcast_recipients_broadcast_status_idx
  on wa_broadcast_recipients(broadcast_id, status);

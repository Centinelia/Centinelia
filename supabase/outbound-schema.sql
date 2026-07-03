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

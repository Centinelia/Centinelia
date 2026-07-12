-- Run this in Supabase SQL Editor

create table if not exists email_integrations (
  id               uuid primary key default gen_random_uuid(),
  agent_id         uuid not null references voice_agents(id) on delete cascade,
  provider         text not null check (provider in ('gmail', 'outlook')),
  email            text not null,
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  auto_reply       boolean not null default false,
  last_sync_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique(agent_id, provider)
);

-- Add auto_replied status to ops_inbox if not already present
-- (safe to run even if already exists)
alter table ops_inbox
  drop constraint if exists ops_inbox_status_check;

alter table ops_inbox
  add constraint ops_inbox_status_check
  check (status in ('pending', 'approved', 'rejected', 'skipped', 'auto_replied'));

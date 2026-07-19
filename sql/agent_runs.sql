-- Agent run logs — lightweight harness observability
-- Run once in Supabase SQL editor

create table if not exists agent_runs (
  id           uuid        primary key default gen_random_uuid(),
  agent_id     uuid        not null references voice_agents(id) on delete cascade,
  portal_email text,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  duration_ms  integer,
  tools_called jsonb       not null default '[]'::jsonb,
  llm_calls    integer     not null default 0,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists agent_runs_agent_id_idx     on agent_runs (agent_id);
create index if not exists agent_runs_portal_email_idx on agent_runs (portal_email);
create index if not exists agent_runs_created_at_idx   on agent_runs (created_at desc);

-- Auto-delete runs older than 90 days (keeps the table lean)
-- Enable pg_cron extension first if not active, then schedule:
-- select cron.schedule('delete-old-agent-runs', '0 3 * * *',
--   $$delete from agent_runs where created_at < now() - interval '90 days'$$);

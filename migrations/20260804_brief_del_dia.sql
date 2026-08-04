-- migrations/20260804_brief_del_dia.sql
-- Nox "brief del dia": config opt-in por agente + tabla de runs para portal card.
-- Corrida por Nazre en Supabase el 2026-08-04 antes de arrancar la implementacion
-- (Task 1 del plan docs/superpowers/plans/2026-08-04-nox-brief-del-dia.md).

alter table voice_agents
  add column if not exists brief_del_dia_config      jsonb null,
  add column if not exists brief_del_dia_last_run_at timestamptz null;

create table if not exists brief_runs (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references voice_agents(id) on delete cascade,
  portal_email    text not null,
  ran_at          timestamptz not null default now(),
  trigger         text not null check (trigger in ('cron', 'reactive')),
  brief_md        text not null,
  buckets_json    jsonb not null,
  delivery_status jsonb not null default '{}'::jsonb,
  read_at         timestamptz null
);

create index if not exists brief_runs_portal_ran on brief_runs (portal_email, ran_at desc);
create index if not exists brief_runs_agent_ran  on brief_runs (agent_id, ran_at desc);

alter table brief_runs enable row level security;

notify pgrst, 'reload schema';

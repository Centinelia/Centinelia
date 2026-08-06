create table if not exists llm_call_log (
  id                             uuid primary key default gen_random_uuid(),
  created_at                     timestamptz not null default now(),
  source                         text not null,
  model                          text not null,
  input_tokens                   int  not null default 0,
  output_tokens                  int  not null default 0,
  cache_creation_input_tokens    int  not null default 0,
  cache_read_input_tokens        int  not null default 0,
  cost_usd                       numeric(10, 6) not null default 0,
  agent_id                       uuid null references voice_agents(id) on delete set null,
  portal_email                   text null,
  latency_ms                     int  null,
  error                          text null,
  meta                           jsonb null
);

create index if not exists llm_call_log_created_idx      on llm_call_log(created_at desc);
create index if not exists llm_call_log_source_idx       on llm_call_log(source);
create index if not exists llm_call_log_portal_email_idx on llm_call_log(portal_email);

alter table llm_call_log enable row level security;
notify pgrst, 'reload schema';

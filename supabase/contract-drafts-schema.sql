-- Contract Templates — one per account (linked to primary agent)
-- clauses: [{ id, title, body, required, enabled }]
create table if not exists contract_templates (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references voice_agents(id) on delete cascade,
  clauses    jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id)
);

-- Contract Drafts — agent-generated per client
create table if not exists contract_drafts (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references voice_agents(id) on delete cascade,
  client_name  text,
  client_email text,
  client_rfc   text,
  client_phone text,
  clauses      jsonb not null default '[]',
  notes        text,
  status       text not null default 'borrador'
               check (status in ('borrador', 'aprobado', 'enviado', 'cancelado')),
  source_type  text,   -- 'llamada' | 'correo' | 'manual' | 'agente'
  source_ref   text,   -- call_id or email id
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists contract_drafts_agent_id_idx on contract_drafts(agent_id);
create index if not exists contract_drafts_status_idx   on contract_drafts(status);
create index if not exists contract_templates_agent_id  on contract_templates(agent_id);

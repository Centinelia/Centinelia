-- Contract Drafts — agent-generated per client.
-- Descubierto en sesión 61 (audit bloque amarillo Y1): el schema estaba en
-- supabase/contract-drafts-schema.sql pero nunca se aplicó a prod. La tool
-- create_contract_draft falla silenciosamente al insertar.
-- Ejecutar en Supabase SQL Editor. Después NOTIFY pgrst para reload cache.

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

alter table contract_drafts enable row level security;

notify pgrst, 'reload schema';

-- Custom brand templates .docx per agent + tipo.
-- Cuando existe, el tool creativity lo prefiere sobre el React PDF default.

create table if not exists document_templates (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references voice_agents(id) on delete cascade,
  tipo         text not null check (tipo in ('propuesta', 'cotizacion', 'one_pager', 'correo')),
  storage_path text not null,
  filename     text not null,
  uploaded_at  timestamptz not null default now(),
  unique (agent_id, tipo)
);

create index if not exists document_templates_agent_tipo on document_templates (agent_id, tipo);

alter table document_templates enable row level security;

notify pgrst, 'reload schema';

-- Tablas de archivo para preservar el ledger de agentes purgados por
-- cleanup-cancelled (fix C11 audit 2026-08-10).
--
-- Contexto: cleanup-cancelled borra agentes con billing_status='cancelado' >30d.
-- El FK de minutes_ledger y ops_ledger a voice_agents tiene ON DELETE SET NULL,
-- así que las rows sobrevivían pero con agent_id=NULL — audit trail huérfano.
-- Retention requerida por Municipio: 7 años.
--
-- Diseño: tablas espejo (mismas columnas + `archived_at`, `archived_reason`,
-- `original_agent_id`). El cron cleanup-cancelled hace INSERT INTO archive
-- SELECT FROM ledger antes del DELETE cascade. Preserva contexto completo.
--
-- Query de auditoría (unificada current + archive):
--   SELECT 'live' as source, * FROM minutes_ledger WHERE portal_email = :email
--   UNION ALL
--   SELECT 'archive', * FROM minutes_ledger_archive WHERE portal_email = :email
--   ORDER BY created_at;

create table if not exists minutes_ledger_archive (
  id                 uuid primary key default gen_random_uuid(),
  original_id        uuid not null,
  archived_at        timestamptz not null default now(),
  archived_reason    text not null,
  original_agent_id  uuid,
  agent_id           uuid,                       -- always null (agente ya no existe)
  portal_email       text,
  amount             integer,
  description        text,
  source             text,
  kind               text,
  reference_id       text,
  created_at         timestamptz
);

create index if not exists minutes_ledger_archive_portal_email_idx
  on minutes_ledger_archive(portal_email);
create index if not exists minutes_ledger_archive_original_agent_idx
  on minutes_ledger_archive(original_agent_id);
create index if not exists minutes_ledger_archive_archived_at_idx
  on minutes_ledger_archive(archived_at desc);

create table if not exists ops_ledger_archive (
  id                 uuid primary key default gen_random_uuid(),
  original_id        uuid not null,
  archived_at        timestamptz not null default now(),
  archived_reason    text not null,
  original_agent_id  uuid,
  agent_id           uuid,
  portal_email       text,
  amount             integer,
  description        text,
  source             text,
  kind               text,
  reference_id       text,
  created_at         timestamptz
);

create index if not exists ops_ledger_archive_portal_email_idx
  on ops_ledger_archive(portal_email);
create index if not exists ops_ledger_archive_original_agent_idx
  on ops_ledger_archive(original_agent_id);
create index if not exists ops_ledger_archive_archived_at_idx
  on ops_ledger_archive(archived_at desc);

-- Ai ops log también debería archivarse por retención 7 años.
create table if not exists ai_ops_log_archive (
  id                 uuid primary key default gen_random_uuid(),
  original_id        uuid not null,
  archived_at        timestamptz not null default now(),
  archived_reason    text not null,
  original_agent_id  uuid,
  agent_id           uuid,
  portal_email       text,
  source             text,
  count              integer,
  reference_id       text,
  label              text,
  context            text,
  created_at         timestamptz
);

create index if not exists ai_ops_log_archive_portal_email_idx
  on ai_ops_log_archive(portal_email);
create index if not exists ai_ops_log_archive_original_agent_idx
  on ai_ops_log_archive(original_agent_id);

notify pgrst, 'reload schema';

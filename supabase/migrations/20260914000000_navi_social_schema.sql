-- Navi social publishing schema — Task 1 of feat/navi-social-media
-- Spec: docs/superpowers/specs/2026-09-14-navi-social-media-design.md §4.2
--
-- Table creation order (respects FK dependencies):
--   1. social_accounts
--   2. brand_templates
--   3. editorial_calendars
--   4. editorial_calendar_slots
--   5. content_drafts
--   6. user_media_uploads
--   7. social_metrics
--   8. social_interactions
--
-- Storage bucket + RLS policy + trigger for role-based account limits appended below.

-- ─── 1. social_accounts ────────────────────────────────────────────────────────
-- Cuentas IG/FB conectadas por org. Patrón alineado con integration_accounts.
-- Navi estándar (role='navi')   : relación 1:1 con voice_agents.
-- Navi Agencia (role='navi_agencia'): relación 1:N (hasta 20 cuentas por agent).
create table social_accounts (
  id                    uuid primary key default gen_random_uuid(),
  portal_email          text not null references organizations(portal_email),
  agent_id              uuid references voice_agents(id) on delete set null,
  provider              text not null check (provider in ('meta_instagram', 'meta_facebook')),
  external_account_id   text not null,   -- IG user id / FB page id
  external_username     text,             -- @handle visible
  page_id               text,             -- FB page linkeada (para IG)
  brand_summary         text,             -- resumen de brand voice para prompt LLM
  denylist_words        text[] default '{}',  -- palabras bloqueadas especificas de esta cuenta
  paused                boolean default false,   -- kill switch por cuenta (Navi Agencia)
  paused_reason         text,
  paused_at             timestamptz,
  access_token          text not null,
  refresh_token         text,
  expires_at            timestamptz,
  status                text not null default 'active' check (status in ('active', 'needs_reauth', 'disconnected')),
  metadata              jsonb default '{}'::jsonb,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  unique (portal_email, provider, external_account_id)
);

-- ─── 2. brand_templates ────────────────────────────────────────────────────────
-- Plantillas Canva registradas por org.
create table brand_templates (
  id                uuid primary key default gen_random_uuid(),
  portal_email      text not null references organizations(portal_email),
  canva_template_id text not null,
  name              text not null,
  category          text not null check (category in ('post', 'reel', 'story', 'carousel')),
  data_fields       jsonb not null,   -- [{name, type, required, default_value?}]
  preview_url       text,
  active            boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (portal_email, canva_template_id)
);

-- ─── 3. editorial_calendars ────────────────────────────────────────────────────
-- Calendario editorial mensual aprobado por cliente.
create table editorial_calendars (
  id            uuid primary key default gen_random_uuid(),
  portal_email  text not null references organizations(portal_email),
  month         date not null,  -- primer dia del mes
  status        text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_by   text,
  approved_at   timestamptz,
  created_at    timestamptz default now(),
  unique (portal_email, month)
);

-- ─── 4. editorial_calendar_slots ───────────────────────────────────────────────
-- Slots de publicacion dentro de un calendario.
create table editorial_calendar_slots (
  id                    uuid primary key default gen_random_uuid(),
  calendar_id           uuid not null references editorial_calendars(id) on delete cascade,
  template_id           uuid references brand_templates(id) on delete set null,
  scheduled_for         timestamptz not null,
  theme                 text,             -- "promo lunes", "tip semanal", "recordatorio horarios"
  recurring_rule        text,             -- rrule si es recurrente
  auto_publish          boolean default false,  -- Level C: si true, Navi publica sin approval
  data_fields_defaults  jsonb default '{}'::jsonb,  -- pre-fill de campos si aplica
  created_at            timestamptz default now()
);

create index on editorial_calendar_slots (scheduled_for);

-- ─── 5. content_drafts ─────────────────────────────────────────────────────────
-- Posts en cualquier estado del pipeline.
-- FKs: social_accounts (1), brand_templates (2), editorial_calendar_slots (4)
create table content_drafts (
  id                    uuid primary key default gen_random_uuid(),
  portal_email          text not null references organizations(portal_email),
  agent_id              uuid not null references voice_agents(id),
  template_id           uuid references brand_templates(id) on delete set null,
  social_account_id     uuid not null references social_accounts(id),
  slot_id               uuid references editorial_calendar_slots(id),
  media_urls            text[] not null default '{}',
  caption               text,
  hashtags              text[] default '{}',
  media_type            text not null check (media_type in ('image', 'carousel', 'reel', 'story')),
  scheduled_for         timestamptz,
  status                text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'scheduled', 'publishing',
    'published', 'rejected', 'failed', 'cancelled'
  )),
  auto_publish          boolean default false,  -- copiado del slot al momento de crear
  navi_reasoning        text,                    -- por que Navi propuso este post
  approved_by           text,                    -- email del portal_user que aprobo
  approved_at           timestamptz,
  published_media_id    text,                    -- IG media id post-publicacion
  published_permalink   text,
  published_at          timestamptz,
  error_message         text,
  retry_count           int default 0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index on content_drafts (portal_email, status);
create index on content_drafts (scheduled_for) where status in ('approved', 'scheduled');

-- ─── 6. user_media_uploads ─────────────────────────────────────────────────────
-- Video/imagen que el cliente envia a Navi por correo, chat o upload directo.
-- FK: content_drafts (5) — por eso va despues de content_drafts.
create table user_media_uploads (
  id                  uuid primary key default gen_random_uuid(),
  portal_email        text not null references organizations(portal_email),
  agent_id            uuid not null references voice_agents(id),
  source              text not null check (source in ('email', 'chat', 'portal_upload')),
  source_message_id   text,              -- id del correo/mensaje origen
  file_url            text not null,     -- Supabase Storage signed URL
  file_type           text not null,     -- video/mp4, image/jpeg, etc.
  file_size_bytes     bigint,
  duration_seconds    int,               -- solo video
  dimensions          text,              -- "1080x1920"
  status              text not null default 'available' check (status in ('available', 'used', 'expired', 'deleted')),
  used_in_draft_id    uuid references content_drafts(id) on delete set null,
  cliente_note        text,              -- texto que acompano el video
  created_at          timestamptz default now(),
  expires_at          timestamptz default (now() + interval '90 days')
);

create index on user_media_uploads (portal_email, status);

-- ─── 7. social_metrics ─────────────────────────────────────────────────────────
-- Snapshots temporales de metricas por post publicado.
create table social_metrics (
  id                uuid primary key default gen_random_uuid(),
  content_draft_id  uuid not null references content_drafts(id) on delete cascade,
  snapshot_at       timestamptz not null default now(),
  snapshot_type     text not null check (snapshot_type in ('24h', '7d', '30d')),
  impressions       int,
  reach             int,
  likes             int,
  comments          int,
  shares            int,
  saves             int,
  plays             int,        -- para reels
  raw_response      jsonb,
  unique (content_draft_id, snapshot_type)
);

-- ─── 8. social_interactions ────────────────────────────────────────────────────
-- Comentarios y DMs manejados por Navi (audit trail de moderacion).
create table social_interactions (
  id                  uuid primary key default gen_random_uuid(),
  portal_email        text not null,
  social_account_id   uuid not null references social_accounts(id),
  content_draft_id    uuid references content_drafts(id) on delete set null,
  interaction_type    text not null check (interaction_type in ('comment', 'dm')),
  external_id         text not null,           -- comment id o thread id
  external_from       text,                     -- @handle
  incoming_text       text not null,
  sentiment           text check (sentiment in ('positive', 'neutral', 'negative', 'crisis')),
  navi_response       text,
  response_status     text not null check (response_status in (
    'auto_replied', 'pending_approval', 'escalated_to_human', 'ignored'
  )),
  approved_by         text,
  responded_at        timestamptz,
  created_at          timestamptz default now(),
  unique (external_id, interaction_type)
);

-- ─── Storage bucket — user-media (privado) ─────────────────────────────────────
-- Bucket privado para video/imagen subido por clientes. El acceso lo valida
-- la API del portal via service_role; nunca acceso publico directo.
insert into storage.buckets (id, name, public)
  values ('user-media', 'user-media', false)
  on conflict do nothing;

-- RLS: solo service_role puede leer/escribir. Portal API valida acceso.
create policy "user-media service access"
  on storage.objects
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ─── Trigger — enforcement de limite de cuentas por role ───────────────────────
-- role='navi'        → maximo 1  social_account por agent_id
-- role='navi_agencia'→ maximo 20 social_accounts por agent_id
create or replace function enforce_navi_account_limit()
returns trigger as $$
declare
  agent_role    text;
  current_count int;
begin
  select role into agent_role from voice_agents where id = new.agent_id;
  select count(*) into current_count from social_accounts where agent_id = new.agent_id;
  if agent_role = 'navi' and current_count >= 1 then
    raise exception 'Navi estándar permite máximo 1 cuenta IG (agent_id=%)', new.agent_id;
  elsif agent_role = 'navi_agencia' and current_count >= 20 then
    raise exception 'Navi Agencia permite máximo 20 cuentas IG (agent_id=%)', new.agent_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_navi_account_limit_trigger
  before insert on social_accounts
  for each row execute function enforce_navi_account_limit();

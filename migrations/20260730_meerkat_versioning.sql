-- Model + Prompt Versioning — pilar 1 evolution framework
-- Spec: docs/superpowers/specs/2026-07-30-model-prompt-versioning-design.md

create table if not exists meerkat_active_versions (
  meerkat_id      text        primary key,
  active_version  int         not null,
  activated_at    timestamptz not null default now(),
  activated_by    text,
  notes           text
);

create table if not exists meerkat_version_history (
  id            uuid         primary key default gen_random_uuid(),
  meerkat_id    text         not null,
  from_version  int,
  to_version    int          not null,
  changed_at    timestamptz  not null default now(),
  changed_by    text,
  reason        text
);

create index if not exists idx_meerkat_history_meerkat
  on meerkat_version_history (meerkat_id, changed_at desc);

-- Seed inicial: todos los 10 meerkats arrancan en v1 (= snapshot del estado pre-versioning).
-- ON CONFLICT DO NOTHING → migration es idempotente y reintentable.
insert into meerkat_active_versions (meerkat_id, active_version, activated_by, notes) values
  ('nia',   1, 'system', 'baseline pre-versioning'),
  ('noah',  1, 'system', 'baseline pre-versioning'),
  ('nico',  1, 'system', 'baseline pre-versioning'),
  ('nelia', 1, 'system', 'baseline pre-versioning'),
  ('nara',  1, 'system', 'baseline pre-versioning'),
  ('naia',  1, 'system', 'baseline pre-versioning'),
  ('neo',   1, 'system', 'baseline pre-versioning'),
  ('nova',  1, 'system', 'baseline pre-versioning'),
  ('nox',   1, 'system', 'baseline pre-versioning'),
  ('niva',  1, 'system', 'baseline pre-versioning')
on conflict (meerkat_id) do nothing;

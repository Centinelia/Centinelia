-- Golden Tests Suite — pilar 4 evolution framework
-- Spec: docs/superpowers/specs/2026-07-30-golden-tests-suite-design.md

create table if not exists golden_test_runs (
  id                  uuid         primary key default gen_random_uuid(),
  meerkat_id          text         not null,
  versions            int[]        not null,
  trigger             text         not null,
  triggered_by        text         not null,
  status              text         not null default 'queued',
  total_scenarios     int          not null,
  completed_scenarios int          not null default 0,
  scenario_hash       text         not null,
  created_at          timestamptz  not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz,
  check (status in ('queued','running','completed','failed'))
);

create index if not exists idx_golden_runs_meerkat_status
  on golden_test_runs (meerkat_id, status);

create index if not exists idx_golden_runs_active
  on golden_test_runs (status)
  where status in ('queued','running');

create table if not exists golden_test_scenario_runs (
  id              uuid         primary key default gen_random_uuid(),
  run_id          uuid         not null references golden_test_runs(id) on delete cascade,
  scenario_id     text         not null,
  meerkat_id      text         not null,
  version         int          not null,
  attempt         int          not null,
  score           numeric(3,2),
  scenario_passed boolean,
  transcript      jsonb        not null,
  judge_output    jsonb,
  duration_ms     int          not null,
  cost_usd        numeric(6,4),
  error           text,
  created_at      timestamptz  not null default now(),
  unique (run_id, scenario_id, version, attempt)
);

create index if not exists idx_golden_scenario_runs_meerkat_version
  on golden_test_scenario_runs (meerkat_id, version);

create table if not exists golden_test_baselines (
  meerkat_id       text         not null,
  version          int          not null,
  run_id           uuid         not null references golden_test_runs(id),
  median_score     numeric(3,2) not null,
  scenario_scores  jsonb        not null,
  scenario_hash    text         not null,
  computed_at      timestamptz  not null default now(),
  primary key (meerkat_id, version)
);

-- SQL function que devuelve el próximo (scenario × version × attempt) sin fila en scenario_runs.
-- Se llama con FOR UPDATE SKIP LOCKED en el worker desde el orchestrator lib.
-- Nota: la función NO conoce los scenario_ids del registry TypeScript. El worker le pasa
-- la lista de (scenario_id, version, attempt) esperados vía CTE inline en la query.
-- Esta función es un helper básico que solo revisa runs.total_scenarios vs completed_scenarios.
-- El "shape" real del próximo pending se calcula en el orchestrator TS.
--
-- I3 fix: pg_try_advisory_xact_lock prevents two cron ticks from processing the same run
-- concurrently. The xact-scoped lock releases when the RPC transaction ends (~milliseconds),
-- which is still short. Combined with the UNIQUE constraint on scenario_runs and the atomic
-- golden_bump_completed function (I1), worst case is: a second worker gets the same run in a
-- later tick, findNextPendingScenario returns the next slot, and any duplicate INSERT is
-- blocked by the UNIQUE constraint.

create or replace function golden_run_lock_next(p_status text default 'queued')
returns table (
  id                  uuid,
  meerkat_id          text,
  versions            int[],
  scenario_hash       text,
  total_scenarios     int,
  completed_scenarios int,
  status              text
) language sql as $$
  select r.id, r.meerkat_id, r.versions, r.scenario_hash,
         r.total_scenarios, r.completed_scenarios, r.status
  from golden_test_runs r
  where r.status in ('queued','running')
    and pg_try_advisory_xact_lock(hashtext(r.id::text))
  order by r.created_at asc
  limit 1
  for update skip locked;
$$;

-- I1 fix: atomic increment of completed_scenarios to avoid read-modify-write race.
-- Use create or replace so re-running this migration is safe (idempotent).
create or replace function golden_bump_completed(p_run_id uuid) returns void language sql as $$
  update golden_test_runs set completed_scenarios = completed_scenarios + 1 where id = p_run_id;
$$;

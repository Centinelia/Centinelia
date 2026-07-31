-- Todas las tablas existen y están vacías
select count(*) as runs from golden_test_runs;                    -- 0
select count(*) as scenario_runs from golden_test_scenario_runs;  -- 0
select count(*) as baselines from golden_test_baselines;          -- 0

-- Índices creados
select indexname from pg_indexes
where tablename in ('golden_test_runs','golden_test_scenario_runs')
order by indexname;

-- Function existe
select proname from pg_proc where proname = 'golden_run_lock_next';

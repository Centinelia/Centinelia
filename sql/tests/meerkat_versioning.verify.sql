-- Debe retornar 10 filas, todas en active_version=1
select meerkat_id, active_version, activated_by, notes from meerkat_active_versions order by meerkat_id;

-- Debe retornar 0 filas (historial arranca vacío)
select count(*) as history_count from meerkat_version_history;

-- Debe retornar el índice
select indexname from pg_indexes where tablename = 'meerkat_version_history';

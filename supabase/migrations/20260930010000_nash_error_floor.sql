-- Nash monitoring: floor por source para evitar re-alertas de errores pre-fix.
--
-- Bug 2026-09-29: Nash creó 3 issues (#77, #79, #80) por el mismo dataset
-- pre-fix del "temperature deprecated" en golden_test. `hasNewSignalsForNash`
-- contaba errores en llm_call_log desde nash_last_run_at sin filtrar por
-- timestamp del último fix conocido. Un cron miss + errores acumulados
-- pre-fix disparaban re-issues cada 10 minutos.
--
-- Fix: nueva tabla `nash_error_floor` con un floor timestamp por source.
-- Nash usa Math.max(sinceIso, floor_timestamp) para contar errores.
-- Cuando cierras un issue de Nash con "false positive - already fixed",
-- INSERT/UPDATE una row aquí con floor = commit date del fix.
--
-- Ver también: feedback_nash_false_positive_prefix_errors.md

CREATE TABLE IF NOT EXISTS nash_error_floor (
  source           text PRIMARY KEY,
  floor_timestamp  timestamptz NOT NULL,
  note             text,
  updated_at       timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE nash_error_floor ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE nash_error_floor IS
  'Floor por source (llm_call_log.source) para evitar re-alertas de Nash sobre errores ya resueltos. Nash cuenta errores desde MAX(nash_last_run_at, floor_timestamp). Actualizar tras deploy de un fix.';

-- Seed inicial: fix del "temperature deprecated" para golden_test (PR #76 mergeado
-- 2026-09-29 15:40 UTC). Esto previene Nash de re-abrir issues #77 #79 #80.
INSERT INTO nash_error_floor (source, floor_timestamp, note)
VALUES (
  'golden_test',
  '2026-09-29T15:40:00Z',
  'Fix temperature deprecated (Sonnet 5.5+) — PR #76 fb86a6ef'
)
ON CONFLICT (source) DO NOTHING;

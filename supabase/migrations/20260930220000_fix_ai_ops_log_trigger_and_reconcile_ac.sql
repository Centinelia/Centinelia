-- Fix broken trigger on ai_ops_log + reconcile AC Proyectos orphan rows.
--
-- Contexto (2026-09-30):
-- Al renombrar organizations.portal_email de tania@acproyectos.com a
-- camila@acproyectos.com, el UPDATE a ai_ops_log falló con:
--   "record 'old' has no field 'amount'"
-- Esto revela que existe un trigger sobre ai_ops_log cuya función referencia
-- OLD.amount, pero ai_ops_log no tiene columna 'amount'.
-- Resultado: cualquier UPDATE a ai_ops_log estaba bloqueado, y quedaron 16 filas
-- huérfanas apuntando a la org de Tania (que ya no existe).

-- Fase 1: descubrir y dropear triggers rotos sobre ai_ops_log
DO $$
DECLARE
  trig RECORD;
  dropped_count INT := 0;
BEGIN
  RAISE NOTICE 'Auditando triggers sobre ai_ops_log...';
  FOR trig IN
    SELECT t.tgname AS trigger_name,
           p.proname AS function_name,
           n.nspname AS function_schema,
           p.prosrc  AS source_snippet
      FROM pg_trigger t
      JOIN pg_class   c ON c.oid = t.tgrelid
      JOIN pg_proc    p ON p.oid = t.tgfoid
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE c.relname = 'ai_ops_log'
       AND NOT t.tgisinternal
  LOOP
    RAISE NOTICE '  trigger=% func=%.% source_preview=%',
      trig.trigger_name,
      trig.function_schema,
      trig.function_name,
      LEFT(trig.source_snippet, 300);

    -- Dropear solo triggers cuya función referencia OLD.amount (root cause)
    IF trig.source_snippet LIKE '%OLD.amount%' OR trig.source_snippet LIKE '%old.amount%' THEN
      RAISE NOTICE '  → DROP: función referencia OLD.amount pero ai_ops_log no tiene columna amount';
      EXECUTE format('DROP TRIGGER %I ON ai_ops_log', trig.trigger_name);
      dropped_count := dropped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Triggers dropeados: %', dropped_count;

  IF dropped_count = 0 THEN
    RAISE EXCEPTION
      'No se encontró trigger con OLD.amount sobre ai_ops_log. Revisar manualmente antes de reintentar el reconcile.';
  END IF;
END $$;

-- Fase 2: reconcile orphan rows AC (Tania → Camila)
UPDATE ai_ops_log
   SET portal_email = 'camila@acproyectos.com'
 WHERE portal_email = 'tania@acproyectos.com';

-- 2026-09-07: Combinada minutes rebalance
-- Starter 300 -> 250, Growth 600 -> 500, Scale 1200 -> 1000.
-- Motivo: análisis de margen (Vapi $0.06/min + Anthropic $0.05/op + buffer +30%).
-- Combinada Alta pasaba a margen 74.9% con solo 520 tareas; nuevo diseño 1,000 min
-- + 1,200 tareas escalado coherente, margen ~68% con buffer, ya no hay $9.22/tarea
-- implícito. Se combina con bump de tareas 420->600, 520->1200 (aplicado directo
-- via UPDATE voice_agents.ai_ops_limit + ledger admin_adjustment el mismo día).
--
-- Se actualiza get_agent_minutes_contribution que tiene los minutos hardcoded.
-- Usada por get_pool_cap para calcular el cap y rollover_efectivo del pool de
-- minutos org-level. Sin este cambio, plans.ts diría 1000 pero cap SQL seguiría
-- diciendo 1200 -> divergencia entre lo acreditado en renewal y el cap del pool.

CREATE OR REPLACE FUNCTION public.get_agent_minutes_contribution(p_agent_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_tier    TEXT;
  v_jornada TEXT;
  v_meerkat TEXT;
BEGIN
  SELECT
    minutes_plan,
    COALESCE(jornada_type, 'combinada'),
    features->>'meerkat_role_id'
  INTO v_tier, v_jornada, v_meerkat
  FROM voice_agents WHERE id = p_agent_id;

  IF v_tier IS NULL THEN RETURN 0; END IF;
  IF v_meerkat IN ('nox', 'niva') THEN RETURN 0; END IF;

  RETURN CASE v_jornada
    WHEN 'combinada' THEN
      CASE v_tier WHEN 'starter' THEN 250 WHEN 'growth' THEN 500
                  WHEN 'scale'   THEN 1000 ELSE 0 END
    WHEN 'minutos' THEN
      CASE v_tier WHEN 'starter' THEN 500 WHEN 'growth' THEN 1000
                  WHEN 'scale'   THEN 2000 ELSE 0 END
    WHEN 'tareas' THEN 0
    ELSE 0
  END;
END;
$function$;

-- 2026-09-22: rebalance Solo Minutos (opción D')
-- Starter 500 -> 350, Growth 900 -> 650, Scale 1800 -> 1300.
-- Motivo: al precio venta efectivo previo ($5.99-6.66/min) el margen de Solo
-- Minutos era 55-60% vs Combinada 71-75%. Con esta bajada el margen sube a
-- ~69-71%, casi paridad con Combinada, y el "trade" tareas→minutos que ve el
-- cliente al elegir Solo Minutos vs Combinada queda razonable (~30% más
-- minutos por renunciar a las tareas de oficina).
-- Buffer de 20 tareas se conserva intencionalmente (movimientos triviales).
-- Cero clientes activos en Solo Minutos al momento del rebalance (verificado
-- con query voice_agents WHERE jornada_type='minutos' AND active) → sin fricción.

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
      CASE v_tier WHEN 'starter' THEN 350 WHEN 'growth' THEN 650
                  WHEN 'scale'   THEN 1300 ELSE 0 END
    WHEN 'tareas' THEN 0
    ELSE 0
  END;
END;
$function$;

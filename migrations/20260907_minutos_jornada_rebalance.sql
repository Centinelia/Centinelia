-- 2026-09-07 (segunda parte): rebalance Solo Minutos
-- Growth 1000 -> 900, Scale 2000 -> 1800. Media 500 sin cambio.
-- Motivo: análisis de margen mostró Solo Min Alta con 66.8% margen (con buffer),
-- el peor de los sabores. Vapi es el costo dominante, cada minuto extra come
-- margen 1:1. Bajar 200 min sube margen a ~69% alineado con los otros sabores.
-- Buffer de 20 tareas se conserva intencionalmente (movimientos triviales de
-- config del cliente).

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
      CASE v_tier WHEN 'starter' THEN 500 WHEN 'growth' THEN 900
                  WHEN 'scale'   THEN 1800 ELSE 0 END
    WHEN 'tareas' THEN 0
    ELSE 0
  END;
END;
$function$;

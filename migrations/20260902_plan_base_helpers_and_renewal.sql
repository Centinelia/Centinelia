-- 2026-09-02: helpers para computar plan_base y renewal grants en el ledger.
--
-- Contexto: refactor de get_pool_cap del mismo día requiere que exista grant
-- 'renewal'/'renovacion' en el ledger del ciclo previo para que el rollover
-- se compute correctamente. Antes reset-minutes cron solo llamaba
-- refresh_pool_cache (sin escribir grant); reset-ops-pool sí escribía grant
-- pero solo si organizations.pool_reset_date <= today (excluye null).
--
-- Estos helpers exponen el plan_base (suma de contribuciones por empleado
-- activo, sin rollover) para que el TS del cron sepa cuánto acreditar en
-- cada renewal.

CREATE OR REPLACE FUNCTION public.get_plan_base_minutes(p_portal_email text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_total int := 0;
  v_agent record;
BEGIN
  FOR v_agent IN
    SELECT id FROM voice_agents
    WHERE portal_email = p_portal_email
      AND active = true
      AND (billing_status = 'activo' OR billing_status IS NULL)
  LOOP
    v_total := v_total + get_agent_minutes_contribution(v_agent.id);
  END LOOP;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_plan_base_ops(p_portal_email text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_model text;
  v_active_contract uuid;
  v_pool int;
  v_total int := 0;
BEGIN
  SELECT billing_model, active_contract_id
    INTO v_model, v_active_contract
    FROM organizations WHERE portal_email = p_portal_email;

  IF v_model = 'annual_prepaid' THEN
    IF v_active_contract IS NULL THEN RETURN 0; END IF;
    SELECT monthly_ops_pool INTO v_pool
      FROM annual_contracts WHERE id = v_active_contract;
    RETURN COALESCE(v_pool, 0);
  END IF;

  SELECT COALESCE(SUM(ai_ops_limit), 0)::int INTO v_total
    FROM voice_agents
    WHERE portal_email = p_portal_email
      AND active = true
      AND (billing_status = 'activo' OR billing_status IS NULL);
  RETURN v_total;
END;
$function$;

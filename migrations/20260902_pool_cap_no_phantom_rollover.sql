-- 2026-09-02: refactor get_pool_cap y get_ops_pool_cap
--
-- BUG previo: ambas funciones retornaban `plan_base × 2` incondicional. Se
-- populaba en account_minutes.minutes_included y account_ops.ops_included,
-- que la UI del portal lee como "capacidad disponible". Todo cliente nuevo
-- veía "1200 base + 1200 del mes anterior" desde el día 1 aunque nunca
-- hubiera arrollado nada — la UI infería el rollover restando el plan base
-- del cap, y la diferencia siempre era exactamente el plan.
--
-- Además cada AFTER INSERT en minutes_ledger/ops_ledger dispara el trigger
-- auto_refresh_pool_cache, que llama refresh_pool_cache → sobrescribe
-- minutes_included = cap. Cualquier corrección manual del cap se revertía
-- en el siguiente consumo real.
--
-- Fix: cap = plan_base + rollover_efectivo. rollover_efectivo se computa
-- solo si el ciclo previo tuvo grant explícito 'renewal'/'renovacion' en
-- el ledger (indica que el cliente estaba pagando y activo). Sin renewal
-- previo → sin rollover → cap = plan base actual.
--
-- El "cap 2× plan" sigue siendo el techo del rollover posible (regla del
-- pool), solo que ahora se aplica como `LEAST(saldo_previo, plan_base)`
-- en lugar de asumirlo siempre.
--
-- Detectado desde piloto Tortillería Estrella: portal mostraba 2400 min y
-- 1040 tareas cuando el plan Pro es 1200/520. Beatriz apenas activó el
-- 27/08, no había mes previo real que arrollar. Ver
-- feedback_pool_transparencia.md (pool event-sourced) y el handoff
-- pool_accounting_gaps_2026-09-01 (frente reactivo cerrado, este es
-- descubrimiento preventivo posterior).

CREATE OR REPLACE FUNCTION public.get_pool_cap(p_portal_email text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_plan_base int := 0;
  v_agent record;
  v_reset_date date;
  v_prev_start timestamptz;
  v_prev_end   timestamptz;
  v_prev_renewals int := 0;
  v_prev_balance int := 0;
  v_rollover int := 0;
BEGIN
  FOR v_agent IN
    SELECT id FROM voice_agents
    WHERE portal_email = p_portal_email
      AND active = true
      AND (billing_status = 'activo' OR billing_status IS NULL)
  LOOP
    v_plan_base := v_plan_base + get_agent_minutes_contribution(v_agent.id);
  END LOOP;

  -- Ciclo previo = [reset - 60d, reset - 30d). Rollover solo si hubo renewal
  -- en ese ciclo (cliente estaba activo). Sin renewal → sin rollover.
  SELECT minutes_reset_date INTO v_reset_date
    FROM account_minutes WHERE portal_email = p_portal_email;

  IF v_reset_date IS NOT NULL THEN
    v_prev_end   := (v_reset_date - INTERVAL '30 days')::timestamptz;
    v_prev_start := (v_reset_date - INTERVAL '60 days')::timestamptz;

    SELECT COUNT(*) INTO v_prev_renewals
      FROM minutes_ledger
      WHERE portal_email = p_portal_email
        AND kind IN ('renewal','renovacion')
        AND created_at >= v_prev_start
        AND created_at < v_prev_end;

    IF v_prev_renewals > 0 THEN
      SELECT COALESCE(SUM(amount), 0)::int INTO v_prev_balance
        FROM minutes_ledger
        WHERE portal_email = p_portal_email
          AND created_at >= v_prev_start
          AND created_at < v_prev_end;

      -- Rollover ≤ plan base (cap 2× total = plan + rollover)
      v_rollover := GREATEST(0, LEAST(v_prev_balance, v_plan_base));
    END IF;
  END IF;

  RETURN v_plan_base + v_rollover;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ops_pool_cap(p_portal_email text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_model text;
  v_active_contract uuid;
  v_pool int;
  v_plan_base int := 0;
  v_reset_date date;
  v_prev_start timestamptz;
  v_prev_end   timestamptz;
  v_prev_renewals int := 0;
  v_prev_balance int := 0;
  v_rollover int := 0;
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

  SELECT COALESCE(SUM(ai_ops_limit), 0)::int INTO v_plan_base
    FROM voice_agents
    WHERE portal_email = p_portal_email
      AND active = true
      AND (billing_status = 'activo' OR billing_status IS NULL);

  SELECT ops_reset_date INTO v_reset_date
    FROM account_ops WHERE portal_email = p_portal_email;

  IF v_reset_date IS NOT NULL THEN
    v_prev_end   := (v_reset_date - INTERVAL '30 days')::timestamptz;
    v_prev_start := (v_reset_date - INTERVAL '60 days')::timestamptz;

    SELECT COUNT(*) INTO v_prev_renewals
      FROM ops_ledger
      WHERE portal_email = p_portal_email
        AND kind = 'renewal'
        AND created_at >= v_prev_start
        AND created_at < v_prev_end;

    IF v_prev_renewals > 0 THEN
      SELECT COALESCE(SUM(amount), 0)::int INTO v_prev_balance
        FROM ops_ledger
        WHERE portal_email = p_portal_email
          AND created_at >= v_prev_start
          AND created_at < v_prev_end;

      v_rollover := GREATEST(0, LEAST(v_prev_balance, v_plan_base));
    END IF;
  END IF;

  RETURN v_plan_base + v_rollover;
END;
$function$;

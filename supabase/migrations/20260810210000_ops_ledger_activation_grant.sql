-- Fix bug de rollout: activar organizations.ops_ledger_enabled sin hacer
-- grant inicial deja al pool en 0 (o negativo si ya hubo consumos), rompiendo
-- toda tool que consuma ops. Detectado 2026-08-10 en portal Pneuma Studio
-- durante demo: "Sin tareas disponibles (15/15600 usadas)" con balance real -15.
--
-- Fix: trigger BEFORE UPDATE detecta la transición false→true y aplica el
-- grant inicial idempotentemente. Sin este trigger, cada activación mid-cycle
-- requiere backfill manual via apply_ops_ledger_entry.

CREATE OR REPLACE FUNCTION public.trigger_ops_ledger_activation_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_existing_grants int;
  v_amount          int;
  v_agent_id        uuid;
BEGIN
  -- Solo actuar en la transición false→true (o NULL→true).
  IF NEW.ops_ledger_enabled IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF OLD.ops_ledger_enabled = true THEN RETURN NEW; END IF;

  -- Idempotencia: si ya hay algún credit en ledger, no duplicar el grant.
  SELECT COUNT(*) INTO v_existing_grants
    FROM ops_ledger
    WHERE portal_email = NEW.portal_email
      AND amount > 0;
  IF v_existing_grants > 0 THEN RETURN NEW; END IF;

  -- Calcular monto del grant inicial según billing_model.
  IF NEW.billing_model = 'annual_prepaid' AND NEW.active_contract_id IS NOT NULL THEN
    SELECT monthly_ops_pool INTO v_amount
      FROM annual_contracts WHERE id = NEW.active_contract_id;
  ELSE
    -- stripe (o unset): suma per-agente activo
    SELECT COALESCE(SUM(ai_ops_limit), 0)::int INTO v_amount
      FROM voice_agents
      WHERE portal_email = NEW.portal_email
        AND active = true;
  END IF;

  IF COALESCE(v_amount, 0) <= 0 THEN RETURN NEW; END IF;

  -- Agent de referencia para el log (cualquier activo).
  SELECT id INTO v_agent_id
    FROM voice_agents
    WHERE portal_email = NEW.portal_email AND active = true
    LIMIT 1;

  PERFORM public.apply_ops_ledger_entry(
    p_portal_email := NEW.portal_email,
    p_agent_id     := v_agent_id,
    p_amount       := v_amount,
    p_kind         := 'activation_grant',
    p_reference_id := format('activation-%s', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')),
    p_description  := format('Grant inicial al activar ops_ledger_enabled (%s tareas)', v_amount)
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ops_ledger_activation_grant ON organizations;
CREATE TRIGGER ops_ledger_activation_grant
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  WHEN (NEW.ops_ledger_enabled IS DISTINCT FROM OLD.ops_ledger_enabled)
  EXECUTE FUNCTION trigger_ops_ledger_activation_grant();

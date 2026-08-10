-- Ops Ledger — event-sourced tracking de tareas/ops con paridad completa a minutes_ledger
-- Ver docs/superpowers/specs/2026-08-09-ops-ledger-design.md

-- 1) Tabla append-only de eventos
CREATE TABLE IF NOT EXISTS ops_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_email  text,
  agent_id      uuid REFERENCES voice_agents(id) ON DELETE SET NULL,
  amount        int NOT NULL,
  kind          text NOT NULL,
  source        text,
  reference_id  text,
  description   text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_ledger_portal_email_idx  ON ops_ledger (portal_email);
CREATE INDEX IF NOT EXISTS ops_ledger_reference_id_idx  ON ops_ledger (reference_id);
CREATE INDEX IF NOT EXISTS ops_ledger_kind_created_idx  ON ops_ledger (kind, created_at DESC);

-- 2) Tabla cache derivada (mirror de account_minutes)
CREATE TABLE IF NOT EXISTS account_ops (
  portal_email    text PRIMARY KEY,
  ops_included    int NOT NULL DEFAULT 0,
  ops_used        int NOT NULL DEFAULT 0,
  ops_balance     int NOT NULL DEFAULT 0,
  ops_reset_date  date,
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

-- 3) Feature flag por org para rollout gradual
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ops_ledger_enabled boolean NOT NULL DEFAULT false;

-- 4) Balance = suma de todos los amounts en ledger para un portal_email
CREATE OR REPLACE FUNCTION public.get_ops_pool_balance(p_portal_email text)
RETURNS int
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(SUM(amount), 0)::int
  FROM ops_ledger
  WHERE portal_email = p_portal_email;
$function$;

-- 5) Cap: 2× para stripe, monthly_ops_pool del contrato para annual
CREATE OR REPLACE FUNCTION public.get_ops_pool_cap(p_portal_email text)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_model  text;
  v_active_contract uuid;
  v_pool   int;
  v_base   int := 0;
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

  -- Default = stripe (o unset): 2× la suma de ai_ops_limit per-agente activo
  SELECT COALESCE(SUM(ai_ops_limit), 0)::int INTO v_base
    FROM voice_agents
    WHERE portal_email = p_portal_email
      AND active = true
      AND (billing_status = 'activo' OR billing_status IS NULL);

  RETURN v_base * 2;
END;
$function$;

-- 6) Aplica un credit/debit con cap 2× enforcement (solo para stripe)
CREATE OR REPLACE FUNCTION public.apply_ops_ledger_entry(
  p_portal_email  text,
  p_agent_id      uuid,
  p_amount        int,
  p_kind          text,
  p_reference_id  text DEFAULT NULL,
  p_description   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_balance INT;
  v_cap     INT;
  v_excess  INT;
  v_model   text;
  v_desc    text;
BEGIN
  v_desc := COALESCE(p_description, format('%s: %s ops', p_kind, p_amount));

  SELECT billing_model INTO v_model
    FROM organizations WHERE portal_email = p_portal_email;

  -- Cap enforcement solo aplica a credits (amount > 0) y modelo stripe
  IF p_amount > 0 AND p_portal_email IS NOT NULL AND (v_model IS NULL OR v_model = 'stripe') THEN
    v_balance := get_ops_pool_balance(p_portal_email);
    v_cap     := get_ops_pool_cap(p_portal_email);

    IF v_balance + p_amount > v_cap THEN
      v_excess := v_balance + p_amount - v_cap;
      INSERT INTO ops_ledger (
        portal_email, agent_id, amount, kind, reference_id,
        description, source
      ) VALUES (
        p_portal_email, p_agent_id, -v_excess, 'rollover_cap',
        p_reference_id,
        format('Se pierden %s tareas por exceder cap 2x', v_excess),
        'rollover_cap'
      );
    END IF;
  END IF;

  INSERT INTO ops_ledger (
    portal_email, agent_id, amount, kind, reference_id,
    description, source
  ) VALUES (
    p_portal_email, p_agent_id, p_amount, p_kind, p_reference_id,
    v_desc, p_kind
  );
END;
$function$;

-- 7) Consumo: inserta un debit y devuelve balance actualizado
CREATE OR REPLACE FUNCTION public.consume_pool_ops(
  p_portal_email  text,
  p_agent_id      uuid,
  p_ops           int,
  p_reference_id  text DEFAULT NULL,
  p_description   text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
AS $function$
DECLARE
  v_desc text;
BEGIN
  v_desc := COALESCE(p_description, format('consumo: %s ops', p_ops));

  INSERT INTO ops_ledger (
    portal_email, agent_id, amount, kind, reference_id,
    description, source
  ) VALUES (
    p_portal_email, p_agent_id, -p_ops, 'consumption', p_reference_id,
    v_desc, 'consumption'
  );

  RETURN get_ops_pool_balance(p_portal_email);
END;
$function$;

-- 8) Annual grant: cierra ciclo con unused_forfeited + abre nuevo con annual_grant
CREATE OR REPLACE FUNCTION public.apply_ops_annual_grant(p_portal_email text)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_unused   int;
  v_contract uuid;
  v_pool     int;
BEGIN
  v_unused := get_ops_pool_balance(p_portal_email);

  IF v_unused > 0 THEN
    INSERT INTO ops_ledger (
      portal_email, agent_id, amount, kind, reference_id, description, source
    ) VALUES (
      p_portal_email, NULL, -v_unused, 'unused_forfeited', NULL,
      format('Se pierden %s tareas no consumidas del ciclo anterior', v_unused),
      'unused_forfeited'
    );
  END IF;

  SELECT active_contract_id INTO v_contract
    FROM organizations WHERE portal_email = p_portal_email;
  IF v_contract IS NULL THEN RETURN; END IF;

  SELECT monthly_ops_pool INTO v_pool
    FROM annual_contracts WHERE id = v_contract;
  IF v_pool IS NULL OR v_pool <= 0 THEN RETURN; END IF;

  INSERT INTO ops_ledger (
    portal_email, agent_id, amount, kind, reference_id, description, source
  ) VALUES (
    p_portal_email, NULL, v_pool, 'annual_grant', v_contract::text,
    format('Grant mensual del contrato anual: %s tareas', v_pool),
    'annual_grant'
  );
END;
$function$;

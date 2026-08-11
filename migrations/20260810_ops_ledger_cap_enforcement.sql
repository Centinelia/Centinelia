-- Cap 2× enforcement + annual grant SQL functions para ops_ledger
-- (fix H9 audit 2026-08-10 — implementa spec 2026-08-09-ops-ledger-design.md).
--
-- ⚠️  REVISAR ANTES DE APLICAR ⚠️
-- Este migration REEMPLAZA (CREATE OR REPLACE) funciones RPC existentes:
--   - get_ops_pool_balance
--   - get_ops_pool_cap
--   - apply_ops_ledger_entry
--   - apply_ops_annual_grant
--
-- Si alguna función existente tiene lógica adicional NO documentada en el
-- spec, esta migration la sobrescribirá. Antes de aplicar:
--   1. Descargar definiciones actuales desde Supabase (Database → Functions)
--   2. Diff contra las definiciones abajo
--   3. Merge cualquier lógica adicional necesaria
--   4. Aplicar migración
--
-- Decisiones del audit 2026-08-10 (Nazre):
--   - Cap ops = 2× jornada (misma política que minutos)
--   - Retention audit trail: 7 años
--   - Municipio + enterprise = annual_prepaid confirmado

-- ─── 1. get_ops_pool_balance ─────────────────────────────────────────────────
create or replace function get_ops_pool_balance(p_portal_email text)
returns integer
language sql
stable
as $$
  select coalesce(sum(amount), 0)::integer
  from ops_ledger
  where portal_email = p_portal_email;
$$;

-- ─── 2. get_ops_pool_cap ─────────────────────────────────────────────────────
-- annual_prepaid: cap = monthly_ops_pool del contrato activo
-- stripe:         cap = 2 × SUM(ai_ops_limit) de agentes activos+billing_status='activo'
create or replace function get_ops_pool_cap(p_portal_email text)
returns integer
language plpgsql
stable
as $$
declare
  v_model text;
  v_contract_id uuid;
  v_pool integer;
begin
  select billing_model, active_contract_id
    into v_model, v_contract_id
  from organizations
  where portal_email = p_portal_email;

  if v_model = 'annual_prepaid' and v_contract_id is not null then
    select monthly_ops_pool into v_pool
    from annual_contracts
    where id = v_contract_id;
    return coalesce(v_pool, 0);
  end if;

  -- stripe (default): 2× sum de ai_ops_limit de agentes activos
  select coalesce(sum(ai_ops_limit), 0) * 2 into v_pool
  from voice_agents
  where portal_email = p_portal_email
    and active = true
    and billing_status = 'activo';

  return coalesce(v_pool, 0);
end;
$$;

-- ─── 3. apply_ops_ledger_entry con cap enforcement ───────────────────────────
-- Mirror de apply_ledger_entry. Si stripe + amount>0 + (balance+amount) > cap:
--   1. Inserta row kind='rollover_cap' amount=-(excess) con mismo reference_id
--   2. Inserta el credit con amount completo
-- Annual no aplica cap (grants siempre completos).
create or replace function apply_ops_ledger_entry(
  p_portal_email text,
  p_agent_id     uuid,
  p_amount       integer,
  p_kind         text,
  p_reference_id text,
  p_description  text
)
returns void
language plpgsql
as $$
declare
  v_model text;
  v_current_balance integer;
  v_cap integer;
  v_excess integer;
begin
  -- Solo enforce cap para credits positivos en stripe
  if p_amount > 0 then
    select billing_model into v_model
    from organizations
    where portal_email = p_portal_email;

    if coalesce(v_model, 'stripe') = 'stripe' then
      v_current_balance := get_ops_pool_balance(p_portal_email);
      v_cap := get_ops_pool_cap(p_portal_email);

      if v_cap > 0 and (v_current_balance + p_amount) > v_cap then
        v_excess := (v_current_balance + p_amount) - v_cap;
        -- Registro de pérdida por cap 2× — usado por pool-loss-notify + admin dash
        insert into ops_ledger (portal_email, agent_id, amount, kind, source, reference_id, description)
        values (
          p_portal_email,
          p_agent_id,
          -v_excess,
          'rollover_cap',
          'ajuste',
          p_reference_id,
          format('Cap 2×: %s tareas no acumuladas (balance %s + credit %s > cap %s)', v_excess, v_current_balance, p_amount, v_cap)
        );
      end if;
    end if;
  end if;

  -- Insertar el credit/debit solicitado (siempre, cap ya se registró aparte)
  insert into ops_ledger (portal_email, agent_id, amount, kind, source, reference_id, description)
  values (
    p_portal_email,
    p_agent_id,
    p_amount,
    p_kind,
    'ajuste',
    p_reference_id,
    p_description
  );
end;
$$;

-- ─── 4. apply_ops_annual_grant ───────────────────────────────────────────────
-- 1. Si balance>0, insert unused_forfeited=-balance (audit trail de pérdida)
-- 2. Fetch monthly_ops_pool del contrato
-- 3. Insert annual_grant=+monthly_ops_pool
create or replace function apply_ops_annual_grant(p_portal_email text)
returns void
language plpgsql
as $$
declare
  v_contract_id uuid;
  v_grant integer;
  v_current_balance integer;
begin
  select active_contract_id into v_contract_id
  from organizations
  where portal_email = p_portal_email;

  if v_contract_id is null then
    raise notice 'apply_ops_annual_grant: no active contract for %', p_portal_email;
    return;
  end if;

  select monthly_ops_pool into v_grant
  from annual_contracts
  where id = v_contract_id;

  if v_grant is null or v_grant <= 0 then
    raise notice 'apply_ops_annual_grant: contract % has no monthly_ops_pool', v_contract_id;
    return;
  end if;

  -- Forfeit del balance no consumido
  v_current_balance := get_ops_pool_balance(p_portal_email);
  if v_current_balance > 0 then
    insert into ops_ledger (portal_email, agent_id, amount, kind, source, reference_id, description)
    values (
      p_portal_email,
      null,
      -v_current_balance,
      'unused_forfeited',
      'ajuste',
      'annual_cycle_' || to_char(now(), 'YYYY-MM'),
      format('Se pierden %s tareas no consumidas del ciclo anterior', v_current_balance)
    );
  end if;

  -- Nuevo grant del ciclo
  insert into ops_ledger (portal_email, agent_id, amount, kind, source, reference_id, description)
  values (
    p_portal_email,
    null,
    v_grant,
    'annual_grant',
    'ajuste',
    'annual_cycle_' || to_char(now(), 'YYYY-MM'),
    format('Grant mensual contrato annual: +%s tareas', v_grant)
  );
end;
$$;

notify pgrst, 'reload schema';

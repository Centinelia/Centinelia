-- Backfill minutes_ledger para clientes annual_prepaid (fix C1 audit 2026-08-10).
--
-- Contexto: pool-consume.ts:160 hacía UPDATE directo a organizations
-- .monthly_minutes_used sin escribir minutes_ledger. Todos los clientes annual
-- (incluidos Municipio + enterprise) tenían cero audit trail de consumo
-- llamada-por-llamada. El fix del código está aplicado; esta migration
-- reconstruye la historia retroactivamente desde voice_calls.
--
-- Idempotencia: usa NOT EXISTS check por vapi_call_id para no duplicar rows si
-- se corre múltiples veces. Los rows sintéticos llevan source='backfill_c1'
-- para distinguirlos de los nativos y kind='call' para que sumen normal en
-- reportes/CSV.
--
-- Scope: solo agentes con portal_email de organizaciones annual_prepaid.
-- Los clientes stripe ya usan consume_pool_minutes RPC que escribe ledger.

do $$
declare
  backfilled_count int;
begin
  -- 1. Insertar el row "grant inicial" del contrato por cada annual org.
  --    Suma monthly_minutes_pool para que balance = pool - consumo_backfilled.
  insert into minutes_ledger (portal_email, agent_id, amount, description, source, kind, reference_id, created_at)
  select
    o.portal_email,
    (select id from voice_agents va where va.portal_email = o.portal_email and va.active = true order by created_at asc limit 1),
    ac.monthly_minutes_pool,
    'Grant inicial contrato annual · backfill C1',
    'ajuste',
    'annual_grant',
    'backfill_annual_grant_' || o.portal_email,
    coalesce(ac.starts_at, o.created_at, now())
  from organizations o
  join annual_contracts ac on ac.id = o.active_contract_id
  where o.billing_model = 'annual_prepaid'
    and ac.monthly_minutes_pool > 0
    and not exists (
      select 1 from minutes_ledger ml
      where ml.portal_email = o.portal_email
        and ml.reference_id = 'backfill_annual_grant_' || o.portal_email
    );

  get diagnostics backfilled_count = row_count;
  raise notice 'C1 backfill: % annual grants insertados', backfilled_count;

  -- 2. Insertar rows kind='call' por cada voice_call de agentes annual.
  --    reference_id = vapi_call_id para unicidad + posible join.
  insert into minutes_ledger (portal_email, agent_id, amount, description, source, kind, reference_id, created_at)
  select
    va.portal_email,
    vc.agent_id,
    -greatest(1, ceil(coalesce(vc.duration_seconds, 0)::numeric / 60))::int,
    'Llamada · ' || greatest(1, ceil(coalesce(vc.duration_seconds, 0)::numeric / 60))::int || ' min (backfill C1)',
    'llamada',
    'call',
    coalesce(vc.vapi_call_id, 'backfill_call_' || vc.id::text),
    vc.created_at
  from voice_calls vc
  join voice_agents va on va.id = vc.agent_id
  join organizations o on o.portal_email = va.portal_email
  where o.billing_model = 'annual_prepaid'
    and va.portal_email is not null
    and coalesce(vc.duration_seconds, 0) >= 3          -- match el guard nuevo shouldChargeMinutes
    and not exists (
      select 1 from minutes_ledger ml
      where ml.portal_email = va.portal_email
        and ml.kind = 'call'
        and ml.reference_id = coalesce(vc.vapi_call_id, 'backfill_call_' || vc.id::text)
    );

  get diagnostics backfilled_count = row_count;
  raise notice 'C1 backfill: % call rows insertados desde voice_calls', backfilled_count;
end $$;

notify pgrst, 'reload schema';

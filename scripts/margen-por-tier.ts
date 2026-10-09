import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { JORNADA_CONFIG } = await import('../src/lib/billing/plans');
  const DAYS = 30;
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const USD_MXN = 17.5;

  const { data: agents } = await sb.from('voice_agents')
    .select('id, agent_name, portal_email, jornada_type, minutes_plan, minutes_included, ai_ops_limit, active')
    .eq('active', true);

  const opsByAgent = new Map<string, number>();
  let from = 0;
  while (true) {
    const { data } = await sb.from('ai_ops_log').select('agent_id, count').gte('created_at', since).range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) opsByAgent.set(r.agent_id, (opsByAgent.get(r.agent_id) ?? 0) + Number(r.count ?? 0));
    if (data.length < 1000) break;
    from += 1000;
  }
  const costByAgent = new Map<string, number>();
  from = 0;
  while (true) {
    const { data } = await sb.from('llm_call_log').select('agent_id, cost_usd').gte('created_at', since).range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) costByAgent.set(r.agent_id, (costByAgent.get(r.agent_id) ?? 0) + Number(r.cost_usd ?? 0));
    if (data.length < 1000) break;
    from += 1000;
  }

  type Agg = { agents: number; ops: number; costUsd: number; revenueMxn: number; opsIncluded: number; minutesIncluded: number };
  const byKey = new Map<string, Agg>();
  for (const a of (agents ?? []) as any[]) {
    const jornada = a.jornada_type ?? 'sin_jornada';
    const tier = a.minutes_plan ?? 'sin_tier';
    const key = `${jornada}/${tier}`;
    const tierConfig = (JORNADA_CONFIG as any)[jornada]?.[tier];
    const price = tierConfig?.mxn ?? 0;
    const opsIncl = tierConfig?.aiOps ?? Number(a.ai_ops_limit ?? 0);
    const minIncl = tierConfig?.minutes ?? Number(a.minutes_included ?? 0);
    const agg = byKey.get(key) ?? { agents: 0, ops: 0, costUsd: 0, revenueMxn: 0, opsIncluded: 0, minutesIncluded: 0 };
    agg.agents += 1;
    agg.ops += opsByAgent.get(a.id) ?? 0;
    agg.costUsd += costByAgent.get(a.id) ?? 0;
    agg.revenueMxn += price;
    agg.opsIncluded += opsIncl;
    agg.minutesIncluded += minIncl;
    byKey.set(key, agg);
  }

  console.log('=== Margen por (jornada / tier) — 30 días ===\n');
  console.log('tier                        agents  ops    opsIn   costUSD  costMXN  revMXN  margen  mg%');
  let totalRev = 0, totalCost = 0;
  for (const [k, agg] of [...byKey.entries()].sort((a, b) => b[1].revenueMxn - a[1].revenueMxn)) {
    const costMxn = agg.costUsd * USD_MXN;
    const marg = agg.revenueMxn - costMxn;
    const mgPct = agg.revenueMxn > 0 ? (marg / agg.revenueMxn) * 100 : 0;
    totalRev += agg.revenueMxn;
    totalCost += costMxn;
    console.log(
      `${k.padEnd(28)} ${String(agg.agents).padStart(4)}  ${String(agg.ops).padStart(5)}  ${String(agg.opsIncluded).padStart(5)}  $${agg.costUsd.toFixed(0).padStart(5)}   $${costMxn.toFixed(0).padStart(5)}   $${agg.revenueMxn.toFixed(0).padStart(5)}   $${marg.toFixed(0).padStart(5)}   ${mgPct.toFixed(0)}%`
    );
  }
  const marg = totalRev - totalCost;
  const mgPct = totalRev > 0 ? (marg / totalRev) * 100 : 0;
  console.log(`\n${'TOTAL'.padEnd(28)}                            $${totalCost.toFixed(0).padStart(5)}   $${totalRev.toFixed(0).padStart(5)}   $${marg.toFixed(0).padStart(5)}   ${mgPct.toFixed(1)}%`);

  console.log('\n=== Precio efectivo por op dentro del plan (si cliente consume = ops_incluidas) ===\n');
  for (const [k, agg] of byKey.entries()) {
    if (agg.opsIncluded === 0 || agg.revenueMxn === 0) continue;
    const pricePerOpInPlan = agg.revenueMxn / agg.opsIncluded;
    const costPerOpReal = agg.ops > 0 ? (agg.costUsd * USD_MXN) / agg.ops : 0;
    const marg = pricePerOpInPlan - costPerOpReal;
    const mgPct = pricePerOpInPlan > 0 ? (marg / pricePerOpInPlan) * 100 : 0;
    console.log(`  ${k.padEnd(28)}  precioOpEnPlan=$${pricePerOpInPlan.toFixed(2)}  costoReal=$${costPerOpReal.toFixed(2)}  margen=$${marg.toFixed(2)} (${mgPct.toFixed(0)}%)`);
  }
}
main().catch(e => { console.error('ERR', e); process.exit(1); });

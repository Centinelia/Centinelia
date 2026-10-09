import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const DAYS = 30;
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();

  // 1) LLM cost total (ya está calculado en cost_usd)
  let totalCost = 0;
  let callsSum = 0;
  const byModel = new Map<string, { calls: number; cost: number; inTok: number; outTok: number }>();
  let from = 0;
  while (true) {
    const { data } = await sb.from('llm_call_log')
      .select('model, cost_usd, input_tokens, output_tokens, cache_creation_input_tokens')
      .gte('created_at', since)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      const c = Number(r.cost_usd ?? 0);
      totalCost += c;
      callsSum += 1;
      const m = r.model ?? 'unknown';
      const prev = byModel.get(m) ?? { calls: 0, cost: 0, inTok: 0, outTok: 0 };
      prev.calls += 1;
      prev.cost += c;
      prev.inTok += Number(r.input_tokens ?? 0) + Number(r.cache_creation_input_tokens ?? 0);
      prev.outTok += Number(r.output_tokens ?? 0);
      byModel.set(m, prev);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`=== LLM calls últimos ${DAYS} días ===\n`);
  const sorted = [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
  for (const [model, agg] of sorted) {
    console.log(`  ${model.padEnd(32)} calls=${String(agg.calls).padStart(5)} cost=$${agg.cost.toFixed(2).padStart(7)}  (${(agg.cost / totalCost * 100).toFixed(1)}%)`);
  }
  console.log(`\nTotal Anthropic: USD $${totalCost.toFixed(2)} (${callsSum.toLocaleString()} llm calls)`);

  // 2) Ops consumidas (count)
  let totalOps = 0;
  let opsRecords = 0;
  from = 0;
  while (true) {
    const { data } = await sb.from('ai_ops_log')
      .select('count')
      .gte('created_at', since)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      totalOps += Number(r.count ?? 0);
      opsRecords += 1;
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`\n=== Ops consumidas (ai_ops_log) ===`);
  console.log(`  Total ops cobradas: ${totalOps.toLocaleString()}`);
  console.log(`  Records:            ${opsRecords.toLocaleString()}`);

  // 3) Costo por op
  const USD_MXN = 17.5;
  const costPerOpUsd = totalOps > 0 ? totalCost / totalOps : 0;
  const costPerOpMxn = costPerOpUsd * USD_MXN;
  console.log(`\n=== Costo por op ===`);
  console.log(`  USD $${costPerOpUsd.toFixed(4)}  =  MXN $${costPerOpMxn.toFixed(2)}`);

  // 4) Margen vs overage $8.5 MXN pre-IVA
  const PRICE = 8.5;
  const margin = PRICE - costPerOpMxn;
  const marginPct = PRICE > 0 ? (margin / PRICE) * 100 : 0;
  console.log(`\n=== Margen (overage $${PRICE} MXN pre-IVA) ===`);
  console.log(`  Costo:   MXN $${costPerOpMxn.toFixed(2)}`);
  console.log(`  Venta:   MXN $${PRICE.toFixed(2)}`);
  console.log(`  Margen:  MXN $${margin.toFixed(2)}  (${marginPct.toFixed(1)}%)`);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });

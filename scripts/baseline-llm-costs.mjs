#!/usr/bin/env node
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf-8')
  .split('\n')
  .filter(l => l.trim() && !l.startsWith('#'))
  .reduce((acc, l) => {
    const [k, ...rest] = l.split('=');
    acc[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    return acc;
  }, {});

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE env'); process.exit(1); }

const supabase = createClient(url, key);

async function q1_topCosts() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT source, model,
             COUNT(*) AS calls,
             ROUND(SUM(cost_usd)::numeric, 2) AS total_usd,
             ROUND(AVG(cost_usd)::numeric, 4) AS avg_usd,
             SUM(input_tokens) AS in_tok,
             SUM(output_tokens) AS out_tok,
             SUM(cache_read_input_tokens) AS cache_read_tok,
             SUM(cache_creation_input_tokens) AS cache_create_tok
      FROM llm_call_log
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY source, model
      ORDER BY total_usd DESC NULLS LAST
      LIMIT 20;`
  });
  if (error) {
    console.log('  (RPC exec_sql no existe, uso query builder)');
    const r = await supabase.from('llm_call_log')
      .select('source, model, cost_usd, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens')
      .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .limit(50000);
    if (r.error) throw r.error;
    const agg = {};
    for (const row of r.data) {
      const key = `${row.source}|${row.model}`;
      if (!agg[key]) agg[key] = { source: row.source, model: row.model, calls: 0, total_usd: 0, in_tok: 0, out_tok: 0, cache_read_tok: 0, cache_create_tok: 0 };
      agg[key].calls++;
      agg[key].total_usd += row.cost_usd || 0;
      agg[key].in_tok += row.input_tokens || 0;
      agg[key].out_tok += row.output_tokens || 0;
      agg[key].cache_read_tok += row.cache_read_input_tokens || 0;
      agg[key].cache_create_tok += row.cache_creation_input_tokens || 0;
    }
    return Object.values(agg).sort((a, b) => b.total_usd - a.total_usd).slice(0, 20);
  }
  return data;
}

console.log('=== FASE 0: BASELINE COSTOS LLM (7 días) ===\n');

const top = await q1_topCosts();

// Total
const total = top.reduce((s, r) => s + Number(r.total_usd), 0);
console.log(`💰 Total gastado en 7 días: $${total.toFixed(2)} USD`);
console.log(`   Proyección mensual: $${(total * 30/7).toFixed(2)} USD\n`);

// Top callers
console.log('=== TOP 20 callers por costo ===');
console.log('source | model | calls | total_usd | avg_usd | cache_hit%');
top.forEach(r => {
  const totalIn = Number(r.in_tok) + Number(r.cache_read_tok) + Number(r.cache_create_tok);
  const cacheHitPct = totalIn > 0 ? ((Number(r.cache_read_tok) / totalIn) * 100).toFixed(1) : '0.0';
  const shortModel = String(r.model).replace('claude-', '').replace('-2025', '').replace('-2026', '');
  console.log(`  ${r.source.padEnd(30)} | ${shortModel.padEnd(20)} | ${String(r.calls).padStart(6)} | $${Number(r.total_usd).toFixed(2).padStart(8)} | $${Number(r.avg_usd).toFixed(4)} | ${cacheHitPct.padStart(5)}%`);
});

// Cache hit ratio por source
console.log('\n=== Cache hit ratio por source (7 días) ===');
const bySource = {};
for (const r of top) {
  if (!bySource[r.source]) bySource[r.source] = { in: 0, cache: 0, cost: 0 };
  bySource[r.source].in += Number(r.in_tok);
  bySource[r.source].cache += Number(r.cache_read_tok);
  bySource[r.source].cost += Number(r.total_usd);
}
const sourceRows = Object.entries(bySource)
  .map(([source, s]) => ({ source, cache_pct: s.in + s.cache > 0 ? (s.cache / (s.in + s.cache)) * 100 : 0, cost: s.cost }))
  .sort((a, b) => b.cost - a.cost)
  .slice(0, 15);
sourceRows.forEach(r => {
  console.log(`  ${r.source.padEnd(30)} | cache: ${r.cache_pct.toFixed(1).padStart(5)}% | cost: $${r.cost.toFixed(2)}`);
});

// Model distribution
console.log('\n=== Distribución por modelo (7 días) ===');
const byModel = {};
for (const r of top) {
  const m = String(r.model).replace('claude-', '').replace(/-\d{4,}$/, '');
  if (!byModel[m]) byModel[m] = { calls: 0, cost: 0 };
  byModel[m].calls += Number(r.calls);
  byModel[m].cost += Number(r.total_usd);
}
Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost).forEach(([m, s]) => {
  const pct = total > 0 ? (s.cost / total * 100).toFixed(1) : '0';
  console.log(`  ${m.padEnd(20)} | calls: ${String(s.calls).padStart(6)} | cost: $${s.cost.toFixed(2).padStart(8)} (${pct}%)`);
});

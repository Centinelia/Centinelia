#!/usr/bin/env tsx
/**
 * Baseline collector: agrega métricas de voice_calls de los últimos N días
 * para poder comparar antes/después de cambios en prompts.
 *
 * Uso:
 *   npx tsx scripts/eval/collect-baseline.ts --days=7 --out=baseline.json
 *   npx tsx scripts/eval/collect-baseline.ts --agent=<agent_id> --days=30
 */
import '../_bootstrap';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.+)$/);
  if (m) args.set(m[1], m[2]);
}

const days   = parseInt(args.get('days') ?? '7', 10);
const outArg = args.get('out');
const agent  = args.get('agent');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env.');
  process.exit(1);
}

const supabase = createClient(url, key);

interface CesEntry { score: number; obs: string }
interface CallRow {
  id:                string;
  agent_id:          string;
  outcome:           string | null;
  duration_seconds:  number | null;
  self_eval_score:   number | null;
  ces_data:          Record<string, CesEntry> | null;
  created_at:        string;
}

async function main() {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let q = supabase
    .from('voice_calls')
    .select('id, agent_id, outcome, duration_seconds, self_eval_score, ces_data, created_at')
    .gte('created_at', since);
  if (agent) q = q.eq('agent_id', agent);

  const { data, error } = await q;
  if (error) { console.error(error); process.exit(1); }

  const calls = (data ?? []) as CallRow[];
  if (calls.length === 0) {
    console.error(`Sin llamadas en los últimos ${days} días.`);
    process.exit(0);
  }

  // ── Agregado por outcome
  const byOutcome = new Map<string, number>();
  for (const c of calls) byOutcome.set(c.outcome ?? 'unknown', (byOutcome.get(c.outcome ?? 'unknown') ?? 0) + 1);

  // ── Duración
  const durations = calls.map(c => c.duration_seconds ?? 0).filter(d => d > 0);
  const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  // ── Self-eval promedio
  const selfEvals = calls.map(c => c.self_eval_score).filter((s): s is number => typeof s === 'number');
  const avgSelfEval = selfEvals.length ? +(selfEvals.reduce((a, b) => a + b, 0) / selfEvals.length).toFixed(2) : null;

  // ── CES por dimensión
  const dims = ['fluidez', 'comprension', 'naturalidad', 'conduccion', 'confianza', 'resolucion'];
  const cesAvg: Record<string, number | null> = {};
  for (const d of dims) {
    const scores: number[] = [];
    for (const c of calls) {
      const s = c.ces_data?.[d]?.score;
      if (typeof s === 'number') scores.push(s);
    }
    cesAvg[d] = scores.length >= 3 ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : null;
  }

  const baseline = {
    generated_at: new Date().toISOString(),
    window_days:  days,
    filter:       agent ? { agent_id: agent } : null,
    total_calls:  calls.length,
    outcomes:     Object.fromEntries(byOutcome),
    avg_duration_seconds: avgDur,
    self_eval:    { count: selfEvals.length, avg: avgSelfEval },
    ces_avg:      cesAvg,
  };

  const json = JSON.stringify(baseline, null, 2);
  if (outArg) {
    writeFileSync(outArg, json + '\n');
    console.log(`Baseline escrito en ${outArg}`);
  } else {
    console.log(json);
  }
}

main().catch(err => { console.error(err); process.exit(1); });

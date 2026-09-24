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

const key = env.ELEVENLABS_API_KEY;
if (!key) { console.error('Missing ELEVENLABS_API_KEY'); process.exit(1); }

console.log('=== FASE 0: BASELINE ELEVENLABS ===\n');

// 1. Fetch subscription from ElevenLabs
const sub = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
  headers: { 'xi-api-key': key },
}).then(r => r.json());

const chars = sub.character_count;
const limit = sub.character_limit;
const reset = sub.next_character_count_reset_unix;
const tier = sub.tier;
const status = sub.status;
const nowUnix = Math.floor(Date.now() / 1000);
const daysLeft = Math.round((reset - nowUnix) / 86400);
const cycleStart = reset - 30 * 86400;
const daysElapsed = Math.round((nowUnix - cycleStart) / 86400);
const pctUsed = (chars / limit * 100).toFixed(1);
const pace = (chars / (limit * daysElapsed / 30)).toFixed(2);
const projMonth = Math.round(chars / daysElapsed * 30);

console.log(`Plan tier: ${tier}`);
console.log(`Estado: ${status}`);
console.log(`Ciclo: ${daysElapsed} días transcurridos, ${daysLeft} días restantes`);
console.log(`Caracteres usados: ${chars.toLocaleString()} / ${limit.toLocaleString()} (${pctUsed}%)`);
console.log(`Pace (1.0 = al ritmo): ${pace}×`);
console.log(`Proyección a fin de ciclo: ${projMonth.toLocaleString()} caracteres (${(projMonth/limit*100).toFixed(1)}%)`);

// 2. Query voice_calls last 7 days for minute counts + credit estimation
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key2 = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key2);

const { data: calls, error } = await supabase
  .from('voice_calls')
  .select('agent_id, duration_seconds, created_at')
  .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
  .not('duration_seconds', 'is', null)
  .limit(50000);

if (error) throw error;

const totalSecs = calls.reduce((s, c) => s + (c.duration_seconds || 0), 0);
const totalMins = totalSecs / 60;
const CREDITS_PER_MIN = 315; // per memoria
const estCredits = Math.round(totalMins * CREDITS_PER_MIN);
console.log(`\n=== Uso Voice (últimos 7 días) ===`);
console.log(`Llamadas: ${calls.length}`);
console.log(`Minutos totales: ${totalMins.toFixed(1)}`);
console.log(`Créditos estimados (@315/min): ${estCredits.toLocaleString()}`);
console.log(`Proyección mensual: ${Math.round(totalMins / 7 * 30).toFixed(0)} min = ${Math.round(estCredits/7*30).toLocaleString()} créditos`);

// 3. Per-agent breakdown
const perAgent = {};
for (const c of calls) {
  if (!perAgent[c.agent_id]) perAgent[c.agent_id] = { calls: 0, secs: 0 };
  perAgent[c.agent_id].calls++;
  perAgent[c.agent_id].secs += c.duration_seconds || 0;
}
const { data: agents } = await supabase
  .from('voice_agents')
  .select('id, agent_name, business_name')
  .in('id', Object.keys(perAgent));
const agentMap = Object.fromEntries((agents || []).map(a => [a.id, a]));

console.log(`\n=== Top agentes por minutos (7 días) ===`);
Object.entries(perAgent).sort((a, b) => b[1].secs - a[1].secs).slice(0, 15).forEach(([id, s]) => {
  const a = agentMap[id];
  const mins = (s.secs / 60).toFixed(1);
  const label = a ? `${a.agent_name || 'sin nombre'} · ${a.business_name || ''}` : id.slice(0, 12);
  const credits = Math.round(s.secs / 60 * CREDITS_PER_MIN);
  console.log(`  ${label.padEnd(45)} | calls: ${String(s.calls).padStart(4)} | mins: ${mins.padStart(6)} | est.créditos: ${credits.toLocaleString().padStart(8)}`);
});

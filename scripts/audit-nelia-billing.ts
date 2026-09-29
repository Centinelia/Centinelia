// scripts/audit-nelia-billing.ts
//
// Audita el cobro de minutos de Nelia @ Tortillería para responder:
// 1. ¿Cada voice_call tiene su minutes_ledger row correspondiente?
// 2. ¿Se cobran entrantes Y salientes?
// 3. ¿Por qué 21% quedaron unanswered?
// 4. ¿Cuánto consumió ElevenLabs vs lo cobrado al cliente?
//
// Read-only.
// Corre: pnpm tsx scripts/audit-nelia-billing.ts

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const NELIA_AGENT_ID = 'e22fbc64'; // prefijo, resolveremos abajo
const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';

function fmt(n: number, d = 0) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
}

(async () => {
  console.log('════════════════════════════════════════════════════════════');
  console.log(' AUDIT DE COBRO — NELIA @ TORTILLERÍA ESTRELLA');
  console.log('════════════════════════════════════════════════════════════\n');

  const { data: agents } = await s.from('voice_agents')
    .select('id, agent_name, portal_email')
    .eq('portal_email', PORTAL);
  const nelia = (agents ?? []).find(a => (a.agent_name as string).toLowerCase().includes('nelia'));
  if (!nelia) { console.error('Nelia no encontrada'); process.exit(1); }
  const agentId = nelia.id as string;
  console.log(`Nelia agent_id: ${agentId}\n`);

  // ── PARTE 1: Todas las voice_calls ─────────────────────────────
  const { data: calls } = await s.from('voice_calls')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true });
  const rows = calls ?? [];
  console.log(`voice_calls totales: ${rows.length}`);

  // Columnas disponibles
  const sample = rows[0] ?? {};
  const cols = Object.keys(sample);
  console.log(`columnas disponibles (${cols.length}): ${cols.join(', ')}\n`);

  // ── PARTE 2: Distribución de outcomes y duraciones ──────────────
  console.log('── DISTRIBUCIÓN DE OUTCOMES ──');
  const outcomes: Record<string, { count: number; durs: number[] }> = {};
  for (const r of rows) {
    const k = (r.outcome as string | null) ?? 'null';
    if (!outcomes[k]) outcomes[k] = { count: 0, durs: [] };
    outcomes[k].count++;
    outcomes[k].durs.push((r.duration_seconds as number | null) ?? 0);
  }
  for (const [k, v] of Object.entries(outcomes).sort((a,b) => b[1].count - a[1].count)) {
    const avg = v.durs.reduce((s,x) => s+x, 0) / v.durs.length;
    const max = Math.max(...v.durs);
    const min = Math.min(...v.durs);
    console.log(`  ${k.padEnd(22)} count=${String(v.count).padStart(4)}  dur min/avg/max = ${min}s / ${avg.toFixed(1)}s / ${max}s`);
  }

  // ── PARTE 3: Las 35 unanswered al detalle ──────────────────────
  console.log('\n── LAS "UNANSWERED" AL DETALLE ──');
  const unanswered = rows.filter(r => r.outcome === 'unanswered');
  console.log(`Total: ${unanswered.length}`);
  const durBuckets = { '0s': 0, '1-2s': 0, '3-5s': 0, '6-10s': 0, '11-30s': 0, '31s+': 0 };
  for (const r of unanswered) {
    const d = (r.duration_seconds as number | null) ?? 0;
    if (d === 0) durBuckets['0s']++;
    else if (d <= 2) durBuckets['1-2s']++;
    else if (d <= 5) durBuckets['3-5s']++;
    else if (d <= 10) durBuckets['6-10s']++;
    else if (d <= 30) durBuckets['11-30s']++;
    else durBuckets['31s+']++;
  }
  console.log('Duración (regla del webhook: unanswered = duration <= 5s):');
  for (const [k, v] of Object.entries(durBuckets)) console.log(`  ${k.padEnd(8)} ${v}`);

  // Muestra de 10 unanswered para ver patrón
  console.log('\nMuestra (primeras 10 unanswered):');
  for (const r of unanswered.slice(0, 10)) {
    console.log(`  ${(r.created_at as string).slice(0,19)}  dur=${(r.duration_seconds as number ?? 0)}s  caller=${r.caller_number ?? '?'}  transcript_len=${((r.transcript as string | null) ?? '').length}`);
  }

  // ── PARTE 4: outbound_calls tabla (si existe) ──────────────────
  console.log('\n── ¿NELIA HACE OUTBOUND? ──');
  const { data: outboundRows, error: outErr } = await s.from('outbound_calls')
    .select('id, agent_id, status, created_at, vapi_call_id, contact_id')
    .eq('agent_id', agentId)
    .limit(500);
  if (outErr) {
    console.log(`  outbound_calls: no se pudo leer — ${outErr.message}`);
  } else {
    console.log(`  outbound_calls rows: ${(outboundRows ?? []).length}`);
    const byStatus: Record<string, number> = {};
    for (const r of outboundRows ?? []) {
      const k = (r.status as string | null) ?? 'null';
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
    for (const [k, v] of Object.entries(byStatus)) console.log(`    ${k.padEnd(20)} ${v}`);
  }

  // ── PARTE 5: minutes_ledger de Nelia ──────────────────────────
  console.log('\n── LEDGER DE MINUTOS DE NELIA ──');
  const { data: ledger } = await s.from('minutes_ledger')
    .select('id, amount, description, source, kind, reference_id, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true });
  const ledgerRows = ledger ?? [];
  console.log(`Rows: ${ledgerRows.length}`);
  const negativeLedger = ledgerRows.filter(r => (r.amount as number) < 0);
  const positiveLedger = ledgerRows.filter(r => (r.amount as number) > 0);
  console.log(`  Consumo (amount<0): ${negativeLedger.length} rows, total ${negativeLedger.reduce((s,r) => s + Math.abs(r.amount as number), 0)} min`);
  console.log(`  Grants (amount>0): ${positiveLedger.length} rows, total ${positiveLedger.reduce((s,r) => s + (r.amount as number), 0)} min`);
  const bySource: Record<string, { count: number; sum: number }> = {};
  for (const r of ledgerRows) {
    const k = (r.source as string | null) ?? 'null';
    if (!bySource[k]) bySource[k] = { count: 0, sum: 0 };
    bySource[k].count++;
    bySource[k].sum += (r.amount as number);
  }
  console.log('\nBy source:');
  for (const [k, v] of Object.entries(bySource)) {
    console.log(`  ${k.padEnd(25)} count=${String(v.count).padStart(3)}  sum=${fmt(v.sum, 0)}`);
  }

  // ── PARTE 6: MATCH voice_calls ↔ minutes_ledger ──────────────
  console.log('\n── MATCH voice_calls ↔ minutes_ledger ──');
  // reference_id en ledger de calls suele ser el vapi_call_id
  const ledgerRefs = new Set(ledgerRows.filter(r => r.reference_id).map(r => r.reference_id as string));
  const callVapiIds = new Set(rows.map(r => r.vapi_call_id).filter(Boolean) as string[]);
  const callsWithLedger = rows.filter(r => r.vapi_call_id && ledgerRefs.has(r.vapi_call_id as string));
  const callsWithoutLedger = rows.filter(r => r.vapi_call_id && !ledgerRefs.has(r.vapi_call_id as string));
  console.log(`  voice_calls con vapi_call_id: ${callVapiIds.size}`);
  console.log(`  voice_calls con match en ledger: ${callsWithLedger.length}`);
  console.log(`  voice_calls SIN match en ledger: ${callsWithoutLedger.length}`);

  // Desglose de las que no tienen ledger — ¿son las unanswered como esperamos?
  const noLedgerByOutcome: Record<string, number> = {};
  for (const r of callsWithoutLedger) {
    const k = (r.outcome as string | null) ?? 'null';
    noLedgerByOutcome[k] = (noLedgerByOutcome[k] ?? 0) + 1;
  }
  console.log('\n  Sin ledger, breakdown por outcome (esperado: solo unanswered):');
  for (const [k, v] of Object.entries(noLedgerByOutcome)) {
    console.log(`    ${k.padEnd(22)} ${v}`);
  }

  // FLAG: si hay outcome != unanswered sin ledger → gap real
  const suspiciousGap = callsWithoutLedger.filter(r => r.outcome !== 'unanswered');
  if (suspiciousGap.length > 0) {
    console.log(`\n  🚩 GAP REAL: ${suspiciousGap.length} llamadas atendidas SIN cobro en ledger`);
    for (const r of suspiciousGap.slice(0, 10)) {
      console.log(`    ${(r.created_at as string).slice(0,19)}  outcome=${r.outcome}  dur=${r.duration_seconds}s  vapi_id=${r.vapi_call_id}`);
    }
  } else {
    console.log(`\n  ✓ Sin gaps sospechosos: todas las voice_calls sin ledger son unanswered (correcto por diseño).`);
  }

  // ── PARTE 7: ElevenLabs subscription actual ────────────────────
  console.log('\n── ELEVENLABS: PLAN Y CONSUMO ──');
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!elKey) {
    console.log('  ELEVENLABS_API_KEY no está en .env.local, skip.');
  } else {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': elKey },
    });
    if (!res.ok) {
      console.log(`  ElevenLabs API ${res.status}: ${await res.text()}`);
    } else {
      const sub = await res.json();
      const chars = sub.character_count as number;
      const limit = sub.character_limit as number;
      const reset = sub.next_character_count_reset_unix as number;
      const nowUnix = Math.floor(Date.now() / 1000);
      const daysLeft = Math.round((reset - nowUnix) / 86400);
      const cycleStart = reset - 30 * 86400;
      const daysElapsed = Math.max(1, Math.round((nowUnix - cycleStart) / 86400));
      const pctUsed = (chars / limit * 100).toFixed(1);
      const pace = (chars / (limit * daysElapsed / 30)).toFixed(2);
      const projMonth = Math.round(chars / daysElapsed * 30);
      console.log(`  Plan tier:        ${sub.tier}`);
      console.log(`  Estado:           ${sub.status}`);
      console.log(`  Ciclo:            día ${daysElapsed}/30, quedan ${daysLeft} días`);
      console.log(`  Caracteres:       ${fmt(chars)} / ${fmt(limit)} (${pctUsed}%)`);
      console.log(`  Pace:             ${pace}× (1.0 = al ritmo justo)`);
      console.log(`  Proyección total: ${fmt(projMonth)} caracteres (${(projMonth/limit*100).toFixed(1)}% del plan)`);
    }
  }

  // ── PARTE 8: Consumo ElevenLabs atribuible a Nelia ────────────
  console.log('\n── CRÉDITOS ELEVENLABS DE NELIA (estimado) ──');
  const CREDITS_PER_MIN = 315; // baseline medido 2026-09-22
  const totalSecs = rows.reduce((s, r) => s + ((r.duration_seconds as number | null) ?? 0), 0);
  const totalMins = totalSecs / 60;
  const answeredSecs = rows.filter(r => r.outcome !== 'unanswered').reduce((s, r) => s + ((r.duration_seconds as number | null) ?? 0), 0);
  const answeredMins = answeredSecs / 60;
  console.log(`  Minutos brutos (incl. unanswered): ${totalMins.toFixed(1)} → ~${fmt(Math.round(totalMins * CREDITS_PER_MIN))} créditos`);
  console.log(`  Minutos atendidos:                 ${answeredMins.toFixed(1)} → ~${fmt(Math.round(answeredMins * CREDITS_PER_MIN))} créditos`);
  console.log(`  (Nota: unanswered <=5s también gastan TTS del saludo si Nelia alcanzó a hablar.)`);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });

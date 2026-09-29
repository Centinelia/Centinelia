// scripts/nelia-tortilleria-linkedin-metrics.ts
//
// Métricas de Nelia en Tortillería Estrella para el post de LinkedIn.
// Read-only: no inserta ni actualiza nada.
//
// Corre: pnpm tsx scripts/nelia-tortilleria-linkedin-metrics.ts

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Portal real. El typo viejo (tortillaestrella) queda como huérfano, lo
// consultamos aparte para transparencia pero NO se suma al total.
const PORTAL_REAL = 'servicioalcliente@tortillasestrella.com.mx';
const PORTAL_TYPO = 'servicioalcliente@tortillaestrella.com.mx';

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pct(part: number, whole: number): string {
  if (whole === 0) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

interface Window {
  label: string;
  from:  Date;
  to:    Date;
}

async function findNeliaAgent(portal: string) {
  const { data, error } = await s.from('voice_agents')
    .select('id, agent_name, active, created_at, plan, minutes_used, minutes_included')
    .eq('portal_email', portal);
  if (error) throw error;
  const nelia = (data ?? []).filter(a =>
    (a.agent_name as string | null)?.toLowerCase().includes('nelia'),
  );
  return { all: data ?? [], nelia };
}

async function voiceCallsStats(agentId: string, from: Date, to: Date) {
  const { data, error } = await s.from('voice_calls')
    .select('id, created_at, duration_seconds, outcome, self_eval_score, self_eval_at')
    .eq('agent_id', agentId)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString());
  if (error) throw error;
  const rows = data ?? [];
  const total = rows.length;
  const answered = rows.filter(r => r.outcome !== 'unanswered').length;
  const unanswered = rows.filter(r => r.outcome === 'unanswered').length;
  const totalSecs = rows.reduce((s, r) => s + ((r.duration_seconds as number | null) ?? 0), 0);
  const totalMins = totalSecs / 60;
  const evalRows = rows.filter(r => r.self_eval_score != null);
  const avgScore = evalRows.length > 0
    ? evalRows.reduce((s, r) => s + (r.self_eval_score as number), 0) / evalRows.length
    : null;
  const outcomes: Record<string, number> = {};
  for (const r of rows) {
    const key = (r.outcome as string | null) ?? 'null';
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  return { total, answered, unanswered, totalMins, avgScore, evalCount: evalRows.length, outcomes };
}

async function incidentsStats(agentId: string, from: Date, to: Date) {
  const { data, error } = await s.from('client_incidents')
    .select('id, created_at, business_name, sucursal, motivo, source_channel, verification_result, verification_called_at, verification_scheduled_at, verification_attempts, is_new_client')
    .eq('agent_id', agentId)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString());
  if (error) throw error;
  const rows = data ?? [];
  const total = rows.length;
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const k = (r.source_channel as string | null) ?? 'null';
    bySource[k] = (bySource[k] ?? 0) + 1;
  }
  const verified = rows.filter(r => r.verification_result != null);
  const byResult: Record<string, number> = {};
  for (const r of verified) {
    const k = r.verification_result as string;
    byResult[k] = (byResult[k] ?? 0) + 1;
  }
  const pendingCallback = rows.filter(r =>
    r.verification_result == null && r.verification_scheduled_at != null,
  ).length;
  const totalAttempts = rows.reduce((s, r) => {
    const arr = Array.isArray(r.verification_attempts) ? r.verification_attempts : [];
    return s + arr.length;
  }, 0);
  const uniqueClients = new Set(
    rows.map(r => `${(r.business_name as string).toLowerCase().trim()}|${((r.sucursal as string | null) ?? '').toLowerCase().trim()}`),
  ).size;
  const nuevos = rows.filter(r => r.is_new_client === true).length;
  return { total, bySource, verified: verified.length, byResult, pendingCallback, totalAttempts, uniqueClients, nuevos };
}

async function opsLedgerStats(portal: string, from: Date, to: Date) {
  const { data, error } = await s.from('ops_ledger')
    .select('amount, kind, source, description, created_at')
    .eq('portal_email', portal)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString());
  if (error) throw error;
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + (r.amount as number), 0);
  const bySource: Record<string, number> = {};
  for (const r of rows) {
    const k = (r.source as string | null) ?? 'null';
    bySource[k] = (bySource[k] ?? 0) + (r.amount as number);
  }
  return { totalOps: total, bySource, rows: rows.length };
}

async function minutesLedgerStats(portal: string, from: Date, to: Date) {
  const { data, error } = await s.from('minutes_ledger')
    .select('amount, kind, source, created_at')
    .eq('portal_email', portal)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString());
  if (error) throw error;
  const rows = data ?? [];
  const totalMinsSpent = rows
    .filter(r => (r.amount as number) < 0)
    .reduce((s, r) => s + Math.abs(r.amount as number), 0);
  const totalMinsGranted = rows
    .filter(r => (r.amount as number) > 0)
    .reduce((s, r) => s + (r.amount as number), 0);
  return { rows: rows.length, totalMinsSpent, totalMinsGranted };
}

async function outboundEmailsStats(agentId: string, from: Date, to: Date) {
  // Correos que Nelia MANDÓ (verificaciones, notif de incidencia).
  const { data, error } = await s.from('outbound_emails')
    .select('id, created_at, subject, kind')
    .eq('agent_id', agentId)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString());
  if (error) {
    // Puede que la tabla se llame distinto o no exista aún en algunos entornos.
    return { total: 0, byKind: {} as Record<string, number>, error: error.message };
  }
  const rows = data ?? [];
  const byKind: Record<string, number> = {};
  for (const r of rows) {
    const k = (r.kind as string | null) ?? 'null';
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  return { total: rows.length, byKind };
}

async function firstCallDate(agentId: string): Promise<Date | null> {
  const { data } = await s.from('voice_calls')
    .select('created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (!data || data.length === 0) return null;
  return new Date(data[0].created_at as string);
}

async function report(agentId: string, agentName: string, portal: string, w: Window) {
  const vc = await voiceCallsStats(agentId, w.from, w.to);
  const inc = await incidentsStats(agentId, w.from, w.to);
  const ops = await opsLedgerStats(portal, w.from, w.to);
  const mins = await minutesLedgerStats(portal, w.from, w.to);
  const emails = await outboundEmailsStats(agentId, w.from, w.to);

  console.log(`\n╔════════════════════════════════════════════════════════════`);
  console.log(`║ ${agentName} — ${w.label}`);
  console.log(`║ ${w.from.toISOString().slice(0,10)} a ${w.to.toISOString().slice(0,10)}`);
  console.log(`╚════════════════════════════════════════════════════════════`);

  console.log(`\n── VOZ (voice_calls) ──`);
  console.log(`  Total llamadas:        ${fmt(vc.total)}`);
  console.log(`    Atendidas:           ${fmt(vc.answered)}  (${pct(vc.answered, vc.total)})`);
  console.log(`    Sin respuesta:       ${fmt(vc.unanswered)}  (${pct(vc.unanswered, vc.total)})`);
  console.log(`  Minutos hablados:      ${fmt(vc.totalMins, 1)}`);
  console.log(`  Duración promedio:     ${vc.total > 0 ? fmt(vc.totalMins / vc.total, 2) : '-'} min/llamada`);
  console.log(`  Autoevaluación:        ${vc.avgScore != null ? vc.avgScore.toFixed(2) : '(sin data)'} promedio (${fmt(vc.evalCount)} evaluadas)`);
  console.log(`  Outcomes:`);
  for (const [k, v] of Object.entries(vc.outcomes).sort((a,b) => (b[1] as number) - (a[1] as number))) {
    console.log(`    ${k.padEnd(30)} ${fmt(v)}`);
  }

  console.log(`\n── INCIDENCIAS (client_incidents) ──`);
  console.log(`  Total registradas:     ${fmt(inc.total)}`);
  console.log(`    Clientes únicos:     ${fmt(inc.uniqueClients)}`);
  console.log(`    Clientes nuevos:     ${fmt(inc.nuevos)}`);
  console.log(`  Por canal:`);
  for (const [k, v] of Object.entries(inc.bySource)) {
    console.log(`    ${k.padEnd(20)} ${fmt(v)}`);
  }
  console.log(`  Verificadas:           ${fmt(inc.verified)}  (${pct(inc.verified, inc.total)})`);
  console.log(`  Callback pendiente:    ${fmt(inc.pendingCallback)}`);
  console.log(`  Total intentos:        ${fmt(inc.totalAttempts)} verificaciones/llamadas de seguimiento`);
  console.log(`  Resultados verific.:`);
  for (const [k, v] of Object.entries(inc.byResult)) {
    console.log(`    ${k.padEnd(20)} ${fmt(v)}`);
  }

  console.log(`\n── CORREOS (outbound_emails) ──`);
  if ('error' in emails) {
    console.log(`  (no disponible: ${emails.error})`);
  } else {
    console.log(`  Total enviados:        ${fmt(emails.total)}`);
    for (const [k, v] of Object.entries(emails.byKind)) {
      console.log(`    ${k.padEnd(30)} ${fmt(v)}`);
    }
  }

  console.log(`\n── POOL CONSUMIDO (ledger, portal completo) ──`);
  console.log(`  Ops (tareas):          ${fmt(-ops.totalOps)} tareas (rows: ${ops.rows})`);
  console.log(`  Ops por source:`);
  for (const [k, v] of Object.entries(ops.bySource).sort((a,b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))) {
    console.log(`    ${k.padEnd(30)} ${fmt(-(v as number))}`);
  }
  console.log(`  Minutos gastados:      ${fmt(mins.totalMinsSpent, 1)}`);
  console.log(`  Minutos otorgados:     ${fmt(mins.totalMinsGranted, 1)}`);
}

(async () => {
  console.log('════════════════════════════════════════════════════════════');
  console.log(' NELIA @ TORTILLERÍA ESTRELLA — MÉTRICAS PARA LINKEDIN POST');
  console.log('════════════════════════════════════════════════════════════');

  // 1. Encuentra Nelia
  console.log(`\nPortal real:  ${PORTAL_REAL}`);
  console.log(`Portal typo (huérfano legacy): ${PORTAL_TYPO}`);

  const { all, nelia } = await findNeliaAgent(PORTAL_REAL);
  console.log(`\nAgentes en el portal: ${all.length}`);
  for (const a of all) {
    const marker = (a.agent_name as string | null)?.toLowerCase().includes('nelia') ? ' <-- NELIA' : '';
    console.log(`  ${(a.id as string).slice(0,8)}  ${a.agent_name}  active=${a.active}  created=${(a.created_at as string).slice(0,10)}${marker}`);
  }

  if (nelia.length === 0) {
    console.error(`\nNo se encontró Nelia en el portal. Revisa el nombre.`);
    process.exit(1);
  }
  if (nelia.length > 1) {
    console.log(`\nAviso: hay ${nelia.length} agentes que matchean Nelia. Reportando cada uno.`);
  }

  // 2. Ventanas
  const now = new Date();
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

  // Mes calendario Sep 2026 (UTC).
  const sept2026 = { label: 'Septiembre 2026 (mes calendario, UTC)', from: utc(2026, 9, 1), to: utc(2026, 10, 1) };
  // Últimos 30 días.
  const last30 = { label: 'Últimos 30 días', from: new Date(now.getTime() - 30 * 86400000), to: now };
  // Últimos 60 días para ver 2 meses.
  const last60 = { label: 'Últimos 60 días (2 meses)', from: new Date(now.getTime() - 60 * 86400000), to: now };

  for (const agent of nelia) {
    const agentId = agent.id as string;
    const agentName = agent.agent_name as string;

    // Primera llamada de este agente.
    const first = await firstCallDate(agentId);
    console.log(`\n── ${agentName} (${agentId.slice(0,8)}) ──`);
    console.log(`  Primera llamada:  ${first ? first.toISOString() : '(sin llamadas)'}`);
    console.log(`  minutes_used:     ${agent.minutes_used} / ${agent.minutes_included}`);
    console.log(`  plan:             ${agent.plan}`);

    // Ventana "primer mes desde el arranque" si tenemos primera llamada.
    if (first) {
      const firstMonth: Window = {
        label: '"Primer mes de Nelia" (desde primera llamada + 30 días)',
        from:  first,
        to:    new Date(first.getTime() + 30 * 86400000),
      };
      await report(agentId, agentName, PORTAL_REAL, firstMonth);

      const secondMonth: Window = {
        label: '"Segundo mes de Nelia" (día 31 a día 60)',
        from:  new Date(first.getTime() + 30 * 86400000),
        to:    new Date(first.getTime() + 60 * 86400000),
      };
      await report(agentId, agentName, PORTAL_REAL, secondMonth);
    }

    await report(agentId, agentName, PORTAL_REAL, sept2026);
    await report(agentId, agentName, PORTAL_REAL, last30);
    await report(agentId, agentName, PORTAL_REAL, last60);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(' FIN');
  console.log('════════════════════════════════════════════════════════════');
})().catch(e => { console.error('\nERROR:', e); process.exit(1); });

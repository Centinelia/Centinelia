// Pull de métricas reales para case study Camila/AC Proyectos.
// 2026-10-09 — números verificables desde inventory_mutations_log + ai_ops_log.
// No muta nada. Solo lectura.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Buscar via voice_agents (que sí tiene business_name)
const { data: ac, error: acErr } = await sb.from('voice_agents')
  .select('portal_email, business_name, agent_name, role, id, created_at, active')
  .or('business_name.ilike.%AC Proyectos%,portal_email.ilike.%acproyectos%,portal_email.ilike.%camila%')
  .limit(20);
console.log('── AC Proyectos agents ──');
console.log('err:', acErr);
console.table(ac);
if (!ac?.length) process.exit(1);

const PORTAL = ac[0].portal_email;
console.log('\nPORTAL:', PORTAL, '\n');

const nami = ac.find(a => a.agent_name === 'Nami' || a.role === 'nami') ?? ac[0];
if (!nami) { console.error('No se encontró Nami'); process.exit(1); }
console.log('\nNami agent_id:', nami.id);

// Inventory mutations log (todas las operaciones Nami)
console.log('\n── inventory_mutations_log, agrupado por tool ──');
const { data: muts } = await sb.from('inventory_mutations_log')
  .select('tool_name, success, created_at, ops_charged')
  .eq('agent_id', nami.id)
  .order('created_at', { ascending: false });
console.log(`Total mutations: ${muts?.length ?? 0}`);
if (muts?.length) {
  console.log('Primera:', muts[muts.length - 1].created_at);
  console.log('Última: ', muts[0].created_at);
  const byTool = {};
  const byToolOk = {};
  for (const m of muts) {
    byTool[m.tool_name] = (byTool[m.tool_name] ?? 0) + 1;
    if (m.success) byToolOk[m.tool_name] = (byToolOk[m.tool_name] ?? 0) + 1;
  }
  console.log('\nPor herramienta:');
  for (const t of Object.keys(byTool).sort((a, b) => byTool[b] - byTool[a])) {
    const ok = byToolOk[t] ?? 0;
    const total = byTool[t];
    console.log(`  ${t.padEnd(45)} total=${String(total).padStart(4)}  ok=${String(ok).padStart(4)}  (${((ok / total) * 100).toFixed(0)}%)`);
  }
  const totalOps = muts.reduce((a, m) => a + (m.ops_charged || 0), 0);
  console.log(`\nOps totales cobradas (desde mutations_log): ${totalOps}`);
}

// ai_ops_log para operaciones (completo)
console.log('\n── ai_ops_log Nami (correo + chat) ──');
const { data: ops } = await sb.from('ai_ops_log')
  .select('kind, count, created_at, source')
  .eq('portal_email', PORTAL)
  .eq('agent_id', nami.id)
  .gte('created_at', '2026-10-01')
  .order('created_at', { ascending: false });
console.log(`Total ops rows: ${ops?.length ?? 0}`);
if (ops?.length) {
  const byKind = {};
  const bySrc = {};
  let totalCount = 0;
  for (const o of ops) {
    byKind[o.kind] = (byKind[o.kind] ?? 0) + (o.count || 0);
    bySrc[o.source || 'null'] = (bySrc[o.source || 'null'] ?? 0) + (o.count || 0);
    totalCount += o.count || 0;
  }
  console.log('Total count:', totalCount);
  console.log('Por kind:');
  for (const k of Object.keys(byKind).sort((a, b) => byKind[b] - byKind[a])) {
    console.log(`  ${k.padEnd(45)} ${byKind[k]}`);
  }
  console.log('Por source:');
  for (const s of Object.keys(bySrc).sort((a, b) => bySrc[b] - bySrc[a])) {
    console.log(`  ${s.padEnd(30)} ${bySrc[s]}`);
  }
  console.log('Primera op Oct: ', ops[ops.length - 1]?.created_at);
  console.log('Última op:      ', ops[0]?.created_at);
}

// Correos procesados (ops_inbox)
console.log('\n── ops_inbox Nami ──');
const { data: inbox } = await sb.from('ops_inbox')
  .select('id, status, from_addr, subject, created_at')
  .eq('portal_email', PORTAL)
  .eq('agent_id', nami.id)
  .order('created_at', { ascending: false })
  .limit(200);
console.log(`Correos procesados: ${inbox?.length ?? 0}`);
if (inbox?.length) {
  const byStatus = {};
  for (const i of inbox) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
  console.log('Por status:', byStatus);
  console.log('Primero:', inbox[inbox.length - 1].created_at);
  console.log('Último: ', inbox[0].created_at);
}

// voice_calls (si hay — Nami no es de voz pero por si acaso)
const { data: calls } = await sb.from('voice_calls')
  .select('id, outcome, created_at')
  .eq('agent_id', nami.id)
  .limit(10);
console.log(`\nvoice_calls Nami: ${calls?.length ?? 0} (esperado 0 — Nami es chat/email)`);

process.exit(0);

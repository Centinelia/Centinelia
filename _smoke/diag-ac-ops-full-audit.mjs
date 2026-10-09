// Audit exhaustivo de consumo real de AC Proyectos vs counters mostrados.
// Nazre recuerda contador en 4400+ bajando a 4070ish → ~300+ ops consumidas en desarrollo.
// Actualmente monthly_ops_used=0 → gap.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

// 1. ai_ops_log full (sin filtro de fecha, sin filtro de agent) para portal
console.log('── ai_ops_log TODAS las rows para portal (todas fechas) ──');
const { data: opsAll, count: opsCount } = await sb.from('ai_ops_log')
  .select('kind, count, source, agent_id, created_at', { count: 'exact' })
  .eq('portal_email', PORTAL)
  .order('created_at', { ascending: false })
  .limit(200);
console.log('Total rows:', opsCount);
if (opsAll?.length) {
  console.log('Primera:', opsAll[opsAll.length - 1].created_at);
  console.log('Última: ', opsAll[0].created_at);
  const byKind = {};
  const byAgent = {};
  const bySource = {};
  let totalCount = 0;
  for (const o of opsAll) {
    byKind[o.kind] = (byKind[o.kind] ?? 0) + (o.count || 0);
    byAgent[o.agent_id || 'null'] = (byAgent[o.agent_id || 'null'] ?? 0) + (o.count || 0);
    bySource[o.source || 'null'] = (bySource[o.source || 'null'] ?? 0) + (o.count || 0);
    totalCount += (o.count || 0);
  }
  console.log('\nTotal ops cobradas:', totalCount);
  console.log('\nPor kind:');
  for (const k of Object.keys(byKind).sort((a,b) => byKind[b]-byKind[a])) console.log(`  ${k.padEnd(40)} ${byKind[k]}`);
  console.log('\nPor source:');
  for (const s of Object.keys(bySource).sort((a,b) => bySource[b]-bySource[a])) console.log(`  ${s.padEnd(40)} ${bySource[s]}`);
  console.log('\nPor agent:');
  for (const a of Object.keys(byAgent).sort((a,b) => byAgent[b]-byAgent[a])) console.log(`  ${a.padEnd(40)} ${byAgent[a]}`);
}

// 2. ops_ledger si existe (puede ser la fuente del counter que vio Nazre)
console.log('\n── ops_ledger (si existe) ──');
const { data: ledger, error: ledErr, count: ledCount } = await sb.from('ops_ledger')
  .select('kind, amount, source, agent_id, created_at', { count: 'exact' })
  .eq('portal_email', PORTAL)
  .order('created_at', { ascending: false })
  .limit(10);
console.log('err:', ledErr?.message);
console.log('count:', ledCount);
if (ledger?.length) console.log('primeros 10:', ledger);

// 3. Historial del pool: cualquier evento de reset
console.log('\n── Buscar eventos de reset en ops_ledger_events ──');
const { data: events, error: evErr } = await sb.from('ops_ledger_events')
  .select('*')
  .eq('portal_email', PORTAL)
  .order('created_at', { ascending: false })
  .limit(20);
console.log('err:', evErr?.message);
if (events?.length) console.table(events);

// 4. inventory_mutations_log también (lo que ya tenía 144/117)
console.log('\n── inventory_mutations_log suma ops_charged ──');
const { data: muts } = await sb.from('inventory_mutations_log')
  .select('ops_charged, created_at, tool_name')
  .eq('agent_id', NAMI);
const sumMuts = muts?.reduce((a, m) => a + (m.ops_charged ?? 0), 0) ?? 0;
console.log(`Rows: ${muts?.length}, suma ops_charged: ${sumMuts}`);
if (muts?.length) {
  console.log(`Primera: ${muts[muts.length-1].created_at}`);
  console.log(`Última:  ${muts[0].created_at}`);
}

// 5. Columnas de organizations relevantes (ver si hay cumulative counters más allá de monthly)
console.log('\n── Org actual snapshot ──');
const { data: org } = await sb.from('organizations')
  .select('monthly_ops_pool, monthly_ops_used, monthly_minutes_used, pool_reset_date, created_at')
  .eq('portal_email', PORTAL)
  .single();
console.log(org);

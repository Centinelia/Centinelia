import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const { data: rows } = await sb.from('inventory_mutations_log')
  .select('tool_name, success, error_code, metadata, created_at')
  .eq('agent_id', NAMI)
  .eq('tool_name', 'inv_procesar_oc_qb')
  .order('created_at');

console.log('inv_procesar_oc_qb breakdown:');
const byOutcome = {};
for (const r of rows) {
  const key = r.success ? 'ok' : `fail: ${r.error_code || 'unknown'}`;
  byOutcome[key] = (byOutcome[key] ?? 0) + 1;
}
console.log(byOutcome);
console.log('\nFalla ejemplos:');
for (const r of rows.filter(r => !r.success).slice(0, 5)) {
  console.log('  -', r.created_at, 'err:', r.error_code, 'meta:', JSON.stringify(r.metadata).slice(0, 200));
}

// También ops_inbox sin filtro agent_id para ver si hay otro agent
const { data: inbox } = await sb.from('ops_inbox')
  .select('id, status, from_addr, agent_id, created_at')
  .eq('portal_email', 'camila@acproyectos.com')
  .order('created_at', { ascending: false })
  .limit(50);
console.log('\nops_inbox AC Proyectos total:', inbox?.length ?? 0);
if (inbox?.length) {
  const byStatus = {};
  const byAgent = {};
  for (const i of inbox) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    byAgent[i.agent_id || 'null'] = (byAgent[i.agent_id || 'null'] ?? 0) + 1;
  }
  console.log('Por status:', byStatus);
  console.log('Por agent:', byAgent);
  console.log('Primero:', inbox[inbox.length - 1].created_at);
  console.log('Último: ', inbox[0].created_at);
}

// También ai_ops_log sin filtro agent_id
const { data: ops } = await sb.from('ai_ops_log')
  .select('kind, count, source, agent_id, created_at')
  .eq('portal_email', 'camila@acproyectos.com')
  .gte('created_at', '2026-10-01')
  .order('created_at');
console.log('\nai_ops_log AC Proyectos:', ops?.length ?? 0, 'rows');
if (ops?.length) {
  const byKind = {};
  for (const o of ops) byKind[o.kind] = (byKind[o.kind] ?? 0) + (o.count || 0);
  console.log('By kind:', byKind);
  const totalOps = ops.reduce((a, o) => a + (o.count || 0), 0);
  console.log('Total ops cobradas:', totalOps);
}

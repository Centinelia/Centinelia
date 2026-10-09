// ¿consumeAiOp siguió aceptando después de que yo puse pool=0?
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';

// Resumen temporal de ops_ledger
const { data: ops, count } = await sb.from('ops_ledger')
  .select('kind, amount, source, created_at, agent_id', { count: 'exact' })
  .eq('portal_email', PORTAL)
  .order('created_at', { ascending: true });

console.log('Total rows ops_ledger AC:', count);
console.log('Primera:', ops?.[0]?.created_at);
console.log('Última: ', ops?.[ops.length-1]?.created_at);

// Suma total de consumos
const totalConsumed = ops?.filter(o => o.amount < 0).reduce((a, o) => a + Math.abs(o.amount), 0);
const totalCredits  = ops?.filter(o => o.amount > 0).reduce((a, o) => a + o.amount, 0);
console.log('Total ops consumidas (sum amount<0):', totalConsumed);
console.log('Total créditos agregados (sum amount>0):', totalCredits);
console.log('Balance:', totalCredits - totalConsumed);

// Por día (últimos 14 días)
const byDay = {};
for (const o of ops ?? []) {
  const day = o.created_at.slice(0, 10);
  byDay[day] = (byDay[day] ?? 0) + Math.abs(o.amount);
}
console.log('\nOps por día (últimos 14):');
for (const d of Object.keys(byDay).sort().slice(-14)) {
  console.log(`  ${d}  ${byDay[d]}`);
}

// Últimas 20 rows con detalle
console.log('\nÚltimas 20 rows:');
console.table((ops ?? []).slice(-20).map(o => ({ created: o.created_at.slice(11, 19)+'Z', amt: o.amount, kind: o.kind, src: o.source })));

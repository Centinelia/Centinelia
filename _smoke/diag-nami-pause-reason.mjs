import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const { data: nami } = await sb.from('voice_agents').select('*').eq('id', NAMI).single();

const flags = [
  'active', 'client_paused', 'client_paused_at', 'cancelled_at', 'cancelled_reason',
  'suspended_at', 'suspended_until', 'suspension_reason', 'terminated_at', 'termination_reason',
  'billing_status', 'ai_ops_used', 'ai_ops_limit', 'daily_minutes_cap', 'monthly_minutes_used',
  'auto_mode', 'client_paused_reason',
];
console.log('── Nami diagnostic flags ──');
for (const f of flags) {
  if (f in nami) console.log(`  ${f.padEnd(30)} = ${JSON.stringify(nami[f])}`);
}

// Verificar org pool
const { data: org } = await sb.from('organizations')
  .select('plan, monthly_ops_pool, monthly_ops_used, monthly_minutes_used, pool_reset_date, suspended_at, suspended_until, suspension_reason, terminated_at')
  .eq('portal_email', 'camila@acproyectos.com')
  .single();
console.log('\n── Org pool diagnostic ──');
console.log(org);

// Última mutation (confirmar que sí tiene mutations)
const { data: muts, count } = await sb.from('inventory_mutations_log')
  .select('tool_name, created_at, success, agent_id', { count: 'exact' })
  .eq('agent_id', NAMI)
  .order('created_at', { ascending: false })
  .limit(3);
console.log('\n── Últimas 3 mutations Nami (total count:', count, ') ──');
console.table(muts);

// También query sin filtro para confirmar que la tabla no está vacía
const { count: totalCount } = await sb.from('inventory_mutations_log')
  .select('*', { count: 'exact', head: true });
console.log('\nTotal rows en inventory_mutations_log (toda la tabla):', totalCount);

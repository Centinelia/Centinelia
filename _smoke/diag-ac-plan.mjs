import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('voice_agents')
  .select('*')
  .eq('portal_email', 'camila@acproyectos.com')
  .limit(1);
console.log('err:', error);
console.log('voice_agents cols:', data?.length ? Object.keys(data[0]).sort() : 'none');

const { data: org, error: e2 } = await sb.from('organizations')
  .select('*')
  .eq('portal_email', 'camila@acproyectos.com')
  .limit(1);
console.log('\norganizations err:', e2);
console.log('organizations cols:', org?.length ? Object.keys(org[0]).sort() : 'none');
if (org?.length) {
  const o = org[0];
  console.log('\nValores plan/pool:');
  console.log('  plan:', o.plan);
  console.log('  monthly_ops_pool:', o.monthly_ops_pool);
  console.log('  monthly_ops_used:', o.monthly_ops_used);
  console.log('  monthly_minutes_used:', o.monthly_minutes_used);
  console.log('  pool_reset_date:', o.pool_reset_date);
  console.log('  overage_ops:', o.overage_ops);
  console.log('  overage_minutes:', o.overage_minutes);
  console.log('  business_name:', o.business_name || o.legal_name || o.name);
  console.log('  billing_status: (voice_agents.billing_status quizá)');
}

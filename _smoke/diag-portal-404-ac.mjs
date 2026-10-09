import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TOKEN = 'teyYGe8xILCa';

// 1. ¿Existe la organización con este token?
const { data: org, error: oErr } = await sb.from('organizations')
  .select('portal_email, portal_token, legal_name, suspended_at, terminated_at, plan')
  .eq('portal_token', TOKEN)
  .maybeSingle();
console.log('── Org con token', TOKEN, '──');
console.log('err:', oErr);
console.log(org);

if (!org) {
  // Fallback: busca org de AC por portal_email
  const { data: ac } = await sb.from('organizations')
    .select('portal_email, portal_token, legal_name, suspended_at, terminated_at')
    .eq('portal_email', 'camila@acproyectos.com')
    .maybeSingle();
  console.log('\n── Fallback por portal_email ──');
  console.log(ac);
  process.exit(0);
}

// 2. ¿Hay agentes active=true en esa org?
const { data: agents } = await sb.from('voice_agents')
  .select('id, agent_name, role, active, client_paused, suspended_at, terminated_at, billing_status, created_at')
  .eq('portal_email', org.portal_email)
  .order('created_at');
console.log('\n── Agents del portal ──');
console.table(agents);

const activeOnes = agents?.filter(a => a.active === true) ?? [];
console.log('\nAgentes active=true:', activeOnes.length);
if (activeOnes.length === 0) {
  console.log('⚠️  CAUSA DEL 404: no hay agentes active=true. El portal requiere al menos 1 activo.');
}
if (org.suspended_at) console.log('⚠️  Org suspended_at:', org.suspended_at);
if (org.terminated_at) console.log('⚠️  Org terminated_at:', org.terminated_at);

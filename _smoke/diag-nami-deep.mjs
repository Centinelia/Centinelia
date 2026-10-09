import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

// 1. Nami por ID (bypass portal_email filter)
const { data: nami, error: nErr } = await sb.from('voice_agents')
  .select('id, agent_name, portal_email, active, client_paused, suspended_at, terminated_at, cancelled_at, deleted_at, billing_status')
  .eq('id', NAMI)
  .maybeSingle();
console.log('── Nami por ID ──');
console.log('err:', nErr);
console.log(nami);

// 2. Buscar TODOS los agentes que empatan AC por nombre
const { data: ac } = await sb.from('voice_agents')
  .select('id, agent_name, portal_email, business_name, active, created_at')
  .ilike('business_name', '%AC Proyectos%');
console.log('\n── Agents por business_name AC Proyectos ──');
console.table(ac);

// 3. Buscar por portal_email variations
const { data: byEmail } = await sb.from('voice_agents')
  .select('id, agent_name, portal_email, active, client_paused, billing_status')
  .or('portal_email.eq.camila@acproyectos.com,portal_email.eq.tania@acproyectos.com,portal_email.ilike.%acproyectos%');
console.log('\n── Agents por portal_email AC ──');
console.table(byEmail);

// 4. Último recurso: inventory_mutations_log debería tener filas de Nami. Si Nami existe allá pero no en voice_agents, cascade FK roto
const { data: lastMut } = await sb.from('inventory_mutations_log')
  .select('agent_id, created_at')
  .eq('agent_id', NAMI)
  .order('created_at', { ascending: false })
  .limit(1);
console.log('\n── Última mutation de Nami ──');
console.log(lastMut);

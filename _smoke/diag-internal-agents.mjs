import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Agentes internos de Centinelia (portal nazre20@gmail.com u hola@centinelia.mx)
const { data: agents } = await sb.from('voice_agents')
  .select('id, agent_name, role, portal_email, business_name, active, email_from, email_domain_verified')
  .or('portal_email.eq.nazre20@gmail.com,portal_email.eq.hola@centinelia.mx,portal_email.ilike.%centinelia.mx%')
  .order('created_at');
console.log('── Agentes Centinelia-internos ──');
console.table(agents?.map(a => ({ ...a })) ?? []);

// También Nox (coordinador por default)
const { data: nox } = await sb.from('voice_agents')
  .select('id, agent_name, portal_email, business_name, active, email_from')
  .ilike('agent_name', 'nox')
  .limit(5);
console.log('\n── Nox agents ──');
console.table(nox);

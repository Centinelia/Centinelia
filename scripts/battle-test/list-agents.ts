/**
 * Prints the roster of Pneuma Studio's active agents so we know which agentId
 * to target in each battle test. Also shows meerkat_role_id + phone assignment
 * so we can tell voice-capable ones apart from ops-only coordinators.
 */
import { loadEnv } from './_env';
loadEnv();

import { createClient } from '@supabase/supabase-js';

const PORTAL_EMAIL = 'studio@pneumastudio.mx';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, features, active, vapi_agent_id, phone_number, portal_token')
    .eq('portal_email', PORTAL_EMAIL)
    .order('created_at');

  if (error) throw error;

  console.log(`Roster of ${PORTAL_EMAIL}:`);
  for (const a of data ?? []) {
    const meerkatId = (a.features as any)?.meerkat_role_id ?? '-';
    console.log(
      `  ${a.active ? 'ON ' : 'off'}  ${String(a.agent_name).padEnd(12)}  meerkat=${String(meerkatId).padEnd(6)}  vapi=${a.vapi_agent_id?.slice(0, 8) ?? '(none)'}  phone=${a.phone_number ?? '-'}  id=${a.id}`
    );
  }
}

main().catch(err => { console.error(err); process.exit(1); });

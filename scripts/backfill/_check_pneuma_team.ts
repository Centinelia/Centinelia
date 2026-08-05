import { createClient } from '@supabase/supabase-js';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const { data: sofia } = await supa.from('voice_agents').select('portal_email').eq('id', SOFIA_ID).single();
  const email = sofia?.portal_email;
  console.log(`Pneuma Studio portal_email: ${email}`);
  const { data: peers } = await supa.from('voice_agents')
    .select('id, agent_name, role, features, active, vapi_agent_id')
    .eq('portal_email', email);
  console.log(`\n${peers?.length ?? 0} agentes en el equipo:`);
  for (const p of peers ?? []) {
    const meerkat = (p.features as { meerkat_role_id?: string } | null | undefined)?.meerkat_role_id;
    console.log(`  ${p.agent_name?.padEnd(15)} · rol=${p.role ?? '-'} · meerkat=${meerkat ?? '-'} · active=${p.active} · vapi=${p.vapi_agent_id ? 'yes' : 'no'}`);
  }
}
main().catch(console.error);

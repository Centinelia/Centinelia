import '../_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, phone_number, vapi_agent_id, active')
    .eq('portal_email', 'studio@pneumastudio.mx');

  console.log('=== DB agents ===');
  for (const a of agents ?? []) {
    console.log(`- ${a.agent_name}: phone=${a.phone_number || '(none)'} vapi=${a.vapi_agent_id?.slice(0,8) ?? '(none)'} active=${a.active}`);
  }

  const key = process.env.VAPI_API_KEY;
  if (!key) { console.error('No VAPI_API_KEY'); process.exit(1); }

  console.log('\n=== Vapi phone-number assignments ===');
  const res = await fetch('https://api.vapi.ai/phone-number', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const phones = await res.json() as Array<{ id: string; number?: string; assistantId?: string | null; name?: string }>;

  const sofiaVapiId = agents?.find(a => a.agent_name === 'Sofía')?.vapi_agent_id;
  const noahVapiId  = agents?.find(a => a.agent_name === 'Noah')?.vapi_agent_id;

  for (const p of phones) {
    const label =
      p.assistantId === sofiaVapiId ? '→ Sofia' :
      p.assistantId === noahVapiId  ? '→ Noah'  :
      p.assistantId ? `→ ${p.assistantId.slice(0,8)}` : '(unassigned)';
    console.log(`- ${p.number || p.name || p.id}: ${label}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });

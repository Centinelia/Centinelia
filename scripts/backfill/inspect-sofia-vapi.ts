/**
 * Inspecciona el estado real de Sofia en Vapi:
 * - GET del assistant
 * - Lista de phone numbers y a que assistant estan bindados
 * - Ultimos errores de sync
 */
import '../_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';
import { VapiClient } from '@vapi-ai/server-sdk';

async function main() {
  const supabase = createAdminClient();
  const { data: sofia } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, vapi_agent_id, vapi_phone_number_id, phone_number, active')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .eq('agent_name', 'Sofía')
    .single();
  if (!sofia) { console.error('Sofia no encontrada'); process.exit(1); }

  console.log('=== Sofia en DB ===');
  console.log(JSON.stringify(sofia, null, 2));

  const client = new VapiClient({ token: process.env.VAPI_API_KEY ?? '' });

  console.log('\n=== Sofia assistant en Vapi ===');
  try {
    const asst = await client.assistants.get(sofia.vapi_agent_id);
    console.log('name:', asst.name);
    console.log('firstMessage:', asst.firstMessage);
    console.log('model.provider:', asst.model?.provider);
    console.log('model.model:', asst.model?.model);
    console.log('model.toolIds count:', (asst.model as { toolIds?: string[] })?.toolIds?.length ?? 0);
    console.log('endCallPhrases count:', asst.endCallPhrases?.length ?? 0);
  } catch (e) {
    console.log('ERROR fetching assistant:', (e as Error).message);
  }

  console.log('\n=== Phone numbers en Vapi ===');
  try {
    const numbers = await client.phoneNumbers.list();
    for (const n of numbers) {
      const isSofia = (n as { assistantId?: string }).assistantId === sofia.vapi_agent_id;
      const marker = isSofia ? ' <-- SOFIA' : '';
      console.log(`- ${(n as { number?: string }).number ?? '(no number)'}: assistantId=${(n as { assistantId?: string }).assistantId ?? '(none)'}${marker}`);
    }
  } catch (e) {
    console.log('ERROR listing phones:', (e as Error).message);
  }
}
main().catch(e => { console.error(e); process.exit(1); });

// Simula un assistant-request de Vapi al webhook REAL.

import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const AGENT_ID = 'a8e35a06-f391-4434-a76c-ea076ca8ae30';
  const { data: agent } = await sb.from('voice_agents').select('phone_number').eq('id', AGENT_ID).single();
  const vapiPhoneNumber = agent?.phone_number;
  console.log('Agent phone_number:', vapiPhoneNumber);

  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`;
  const body = {
    message: {
      type: 'assistant-request',
      call: {
        id:          'debug-' + Date.now(),
        phoneNumber: { number: vapiPhoneNumber },
        customer:    { number: '+528112803360' },
      },
    },
  };
  console.log('POST', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-vapi-secret': process.env.VAPI_SERVER_SECRET!,
    },
    body: JSON.stringify(body),
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('\n--- Full response ---');
  console.log(text.slice(0, 4000));
}
main().catch(e => { console.error(e); process.exit(1); });

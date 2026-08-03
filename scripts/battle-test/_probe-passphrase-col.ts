import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await s.from('voice_agents').select('owner_passphrase').eq('id', '9a0c935a-2b47-432a-a2c3-c67bbf915905').single();
  console.log('voice_agents:', { data, error: error?.message });
  const org = await s.from('organizations').select('owner_passphrase').eq('portal_email', 'studio@pneumastudio.mx').maybeSingle();
  console.log('organizations:', { data: org.data, error: org.error?.message });
}
main().catch(err => { console.error(err); process.exit(1); });

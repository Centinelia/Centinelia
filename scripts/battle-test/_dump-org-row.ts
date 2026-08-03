import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await s.from('organizations').select('*').eq('portal_email', 'studio@pneumastudio.mx').single();
  console.log({ error: error?.message, keys: data ? Object.keys(data) : null });
  console.log('id:', data?.id, 'portal_email:', data?.portal_email, 'owner_passphrase:', data?.owner_passphrase);
}
main().catch(err => { console.error(err); process.exit(1); });

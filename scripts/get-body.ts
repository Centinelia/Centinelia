import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: inbox } = await sb.from('ops_inbox').select('email_body, email_subject, created_at')
    .ilike('email_subject', '%Factura Trane%')
    .order('created_at', { ascending: false }).limit(1);
  const row = (inbox?.[0] as any);
  console.log('subject:', row?.email_subject);
  console.log('created:', row?.created_at);
  console.log('body length:', row?.email_body?.length);
  console.log('\n--- BODY (todos los 8000 chars) ---');
  console.log(row?.email_body);
}
main().catch(e => { console.error(e); process.exit(1); });

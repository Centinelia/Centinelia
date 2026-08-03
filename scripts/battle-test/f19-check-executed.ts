import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('portal_email', 'studio@pneumastudio.mx')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log(JSON.stringify(data, null, 2));
}
main().catch(err => { console.error(err); process.exit(1); });

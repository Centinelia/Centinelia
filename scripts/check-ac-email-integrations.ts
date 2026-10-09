import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id, agent_name').eq('portal_email', 'camila@acproyectos.com');
  for (const a of agents ?? []) {
    const { data: ints } = await sb
      .from('email_integrations')
      .select('*')
      .eq('agent_id', (a as any).id);
    console.log(`\nAgent ${(a as any).agent_name} (${(a as any).id}):`);
    for (const i of ints ?? []) {
      console.log('  integration:', {
        provider: (i as any).provider,
        email: (i as any).email,
        auto_reply: (i as any).auto_reply,
        last_sync_at: (i as any).last_sync_at,
        status: (i as any).status ?? 'n/a',
        created_at: (i as any).created_at,
      });
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });

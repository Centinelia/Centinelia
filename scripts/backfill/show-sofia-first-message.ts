/**
 * Muestra el first_message actual de Sofia (Pneuma Studio) para decidir cambio.
 * Solo READ, no modifica nada.
 */
import '../_bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, first_message')
    .eq('portal_email', 'studio@pneumastudio.mx');
  for (const a of data ?? []) {
    console.log('---');
    console.log(`${a.agent_name} (${a.business_name}):`);
    console.log(`  first_message: ${a.first_message ?? '(default sera usado)'}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });

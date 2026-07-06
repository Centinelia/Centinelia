export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import ContratosClient from './ContratosClient';

export default async function ContratosPage() {
  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_name, plan, portal_token, contract_accepted_at, active, contract_text')
    .neq('id', process.env.DEMO_AGENT_ID ?? '')
    .order('created_at', { ascending: false });

  const raw          = agents ?? [];
  const list         = raw.map(({ contract_text, ...rest }) => ({ ...rest, has_custom: !!contract_text }));
  const signedCount  = list.filter(a => a.contract_accepted_at).length;
  const pendingCount = list.filter(a => !a.contract_accepted_at).length;
  const customCount  = list.filter(a => a.has_custom).length;

  return (
    <ContratosClient
      list={list}
      signedCount={signedCount}
      pendingCount={pendingCount}
      customCount={customCount}
    />
  );
}

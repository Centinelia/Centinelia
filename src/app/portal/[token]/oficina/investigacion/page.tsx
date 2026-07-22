export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import InvestigacionSection  from './InvestigacionSection';

interface Props { params: Promise<{ token: string }> }

export default async function InvestigacionPage({ params }: Props) {
  const { token }   = await params;
  const supabase    = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('agent_name, business_name').eq('portal_token', token).single();

  const agentName = (agent as any)?.agent_name ?? agent?.business_name ?? undefined;

  return (
    <div id="of-investigacion">
      <InvestigacionSection token={token} agentName={agentName} />
    </div>
  );
}

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import EncuestasSection from './EncuestasSection';

interface Props { params: Promise<{ token: string }> }

export default async function EncuestasPage({ params }: Props) {
  const { token }  = await params;
  const supabase   = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('agent_name, business_name').eq('portal_token', token).single();

  const agentName = (agent as any)?.agent_name ?? agent?.business_name ?? undefined;

  return (
    <div id="of-encuestas">
      <EncuestasSection token={token} agentName={agentName} />
    </div>
  );
}

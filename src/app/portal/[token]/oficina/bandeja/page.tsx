export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCommsRouting } from '@/lib/comms/routing';
import OpsInboxSection from '../../OpsInboxSection';
import CommsRoutingEditor from './CommsRoutingEditor';
import AttentionPanel from '../AttentionPanel';
import type { InboxAgent } from '../../inbox/categories';

interface Props { params: Promise<{ token: string }> }

export default async function BandejaPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features, portal_email').eq('portal_token', token).single();

  const vertical     = (agent as any)?.features?.vertical as string | undefined;
  const isGobierno   = vertical === 'gobierno';
  const commsRouting = isGobierno && agent ? await getCommsRouting(agent.id as string, supabase) : null;

  let agents: InboxAgent[] = [];
  if ((agent as any)?.portal_email) {
    const { data } = await supabase
      .from('voice_agents')
      .select('id, agent_name, business_name')
      .eq('portal_email', (agent as any).portal_email);
    agents = (data ?? []) as InboxAgent[];
  }

  return (
    <div id="of-bandeja" className="flex flex-col gap-6">
      <AttentionPanel token={token} />
      {commsRouting !== null && (
        <CommsRoutingEditor token={token} initial={commsRouting} />
      )}
      <OpsInboxSection token={token} agents={agents} />
    </div>
  );
}

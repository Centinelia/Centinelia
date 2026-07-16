export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCommsRouting } from '@/lib/comms/routing';
import OpsInboxSection from '../../OpsInboxSection';
import CommsRoutingEditor from './CommsRoutingEditor';

interface Props { params: Promise<{ token: string }> }

export default async function BandejaPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features').eq('portal_token', token).single();

  const vertical     = (agent as any)?.features?.vertical as string | undefined;
  const isGobierno   = vertical === 'gobierno';
  const commsRouting = isGobierno && agent ? await getCommsRouting(agent.id as string, supabase) : null;

  return (
    <div id="of-bandeja" className="flex flex-col gap-4 p-4 md:p-6">
      {commsRouting !== null && (
        <CommsRoutingEditor token={token} initial={commsRouting} />
      )}
      <OpsInboxSection token={token} />
    </div>
  );
}

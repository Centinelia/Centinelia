export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCabildoTemplate } from '@/lib/civic/cabildo';
import CabildoSection from './CabildoSection';
import CabildoTemplateEditor from './CabildoTemplateEditor';

interface Props { params: Promise<{ token: string }> }

export default async function CabildoPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features').eq('portal_token', token).single();

  const isGobierno = ((agent as any)?.features as any)?.vertical === 'gobierno';
  const template   = agent && isGobierno ? await getCabildoTemplate(agent.id as string, supabase) : null;

  return (
    <div id="of-cabildo" className="flex flex-col gap-4 p-4 md:p-6">
      {template && (
        <CabildoTemplateEditor token={token} initial={template} />
      )}
      <CabildoSection token={token} />
    </div>
  );
}

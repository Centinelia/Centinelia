export const dynamic = 'force-dynamic';

import { Gavel } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCabildoTemplate } from '@/lib/civic/cabildo';
import CabildoSection from './CabildoSection';
import CabildoTemplateEditor from './CabildoTemplateEditor';
import OficinaPageHero from '../OficinaPageHero';

interface Props { params: Promise<{ token: string }> }

export default async function CabildoPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features').eq('portal_token', token).single();

  const isGobierno = ((agent as any)?.features as any)?.vertical === 'gobierno';
  const template   = agent && isGobierno ? await getCabildoTemplate(agent.id as string, supabase) : null;

  return (
    <div id="of-cabildo" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={Gavel}
        eyebrow="Cabildo"
        title="Sesiones de cabildo"
        description="Registra sesiones, dictámenes y acuerdos del cabildo. Tu equipo genera actas automáticamente."
      />
      {template && (
        <CabildoTemplateEditor token={token} initial={template} />
      )}
      <CabildoSection token={token} />
    </div>
  );
}

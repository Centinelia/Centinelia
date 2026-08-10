export const dynamic = 'force-dynamic';

import { Gavel } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { getCabildoTemplate } from '@/lib/civic/cabildo';
import CabildoSection from './CabildoSection';
import CabildoTemplateEditor from './CabildoTemplateEditor';
import OficinaPageHero from '../OficinaPageHero';

interface Props { params: Promise<{ token: string }> }

export default async function CabildoPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null }>(
    token,
    'id, features',
    supabase,
  );

  const isGobierno = ((agent as any)?.features as any)?.vertical === 'gobierno';
  const template   = agent && isGobierno ? await getCabildoTemplate(agent.id as string, supabase) : null;

  return (
    <div id="of-cabildo" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={Gavel}
        eyebrow="Gobierno"
        title="Sesiones de cabildo"
        description="Tu equipo captura sesiones, dictámenes y acuerdos, y genera las actas automáticamente para que solo revises y firmes."
      />
      {template && (
        <CabildoTemplateEditor token={token} initial={template} />
      )}
      <CabildoSection token={token} />
    </div>
  );
}

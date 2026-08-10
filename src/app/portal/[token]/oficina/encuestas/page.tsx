export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { PieChart } from 'lucide-react';
import EncuestasSection from './EncuestasSection';
import OficinaPageHero from '../OficinaPageHero';

const SURVEY_MEERKAT_IDS = ['nia', 'nelia', 'naia'];

interface Props { params: Promise<{ token: string }> }

export default async function EncuestasPage({ params }: Props) {
  const { token }  = await params;
  const supabase   = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, business_name, plan, minutes_plan, portal_email')
    .eq('portal_token', token)
    .single();

  const agentName  = (agent as any)?.agent_name ?? agent?.business_name ?? undefined;
  const plan       = (agent as any)?.plan        ?? 'pro';
  const defaultTier = (agent as any)?.minutes_plan ?? 'starter';

  let hasSurveyAgent = false;
  if (agent?.portal_email) {
    const { data: peers } = await supabase
      .from('voice_agents')
      .select('features')
      .eq('portal_email', agent.portal_email as string);
    hasSurveyAgent = (peers ?? []).some(
      (p: any) => SURVEY_MEERKAT_IDS.includes((p.features as any)?.meerkat_role_id ?? ''),
    );
  }

  return (
    <div id="of-encuestas" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      <OficinaPageHero
        icon={PieChart}
        eyebrow="Calidad"
        title="Encuestas de satisfacción"
        description="Diseña una vez y tu equipo aplica la encuesta al terminar cada llamada. Los resultados y hallazgos aparecen aquí."
      />

      <EncuestasSection
        token={token}
        agentName={agentName}
        hasSurveyAgent={hasSurveyAgent}
        plan={plan}
        defaultTier={defaultTier}
      />
    </div>
  );
}

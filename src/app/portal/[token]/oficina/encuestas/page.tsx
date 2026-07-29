export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import EncuestasSection from './EncuestasSection';

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
    <div id="of-encuestas">
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

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { PieChart } from 'lucide-react';
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
    <div id="of-encuestas" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <PieChart size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            Calidad
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Encuestas de satisfacción
          </h1>
          <p className="text-[14px]" style={{ color: '#6B6480' }}>
            Diseña encuestas y deja que tu equipo las aplique automáticamente al terminar cada llamada.
          </p>
        </div>
      </header>

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

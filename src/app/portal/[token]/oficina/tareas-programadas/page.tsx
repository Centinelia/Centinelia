export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import TareasProgramadasSection from './TareasProgramadasSection';
import PlanApprovalsSection    from './PlanApprovalsSection';

interface Props { params: Promise<{ token: string }> }

export default async function TareasProgramadasPage({ params }: Props) {
  const { token } = await params;

  const supabase = createAdminClient();
  const { data: ag } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();

  const { data: agentsRaw } = ag?.portal_email
    ? await supabase
        .from('voice_agents')
        .select('id, agent_name, role, features')
        .eq('portal_email', ag.portal_email)
        .eq('active', true)
    : { data: [] };

  const agents = (agentsRaw ?? []).map((a: Record<string, unknown>) => ({
    id:              a.id as string,
    agent_name:      (a.agent_name as string | null) ?? null,
    role:            (a.role as string | null) ?? null,
    is_coordinator:  !!((a.features as Record<string, unknown>)?.is_coordinator),
    meerkat_role_id: ((a.features as Record<string, unknown>)?.meerkat_role_id as string | null) ?? null,
  }));

  return (
    <div id="of-tareas-programadas">
      <PlanApprovalsSection token={token} />
      <TareasProgramadasSection token={token} agents={agents} />
    </div>
  );
}

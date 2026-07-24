export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import InvestigacionSection  from './InvestigacionSection';

interface Props { params: Promise<{ token: string }> }

export default async function InvestigacionPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: primary } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name')
    .eq('portal_token', token)
    .single();

  let agentName:      string | undefined;
  let meerkatRoleId:  string | null = null;

  if (primary?.portal_email) {
    const { data: all } = await supabase
      .from('voice_agents')
      .select('agent_name, features')
      .eq('portal_email', primary.portal_email)
      .eq('active', true);

    // Prefer the agent that has buscar_en_web; fallback to first with a name
    const researcher = (all ?? []).find(
      (a: any) => Array.isArray((a.features as any)?.tools)
        ? (a.features as any).tools.includes('buscar_en_web')
        : false,
    ) ?? (all ?? []).find((a: any) => a.agent_name) ?? all?.[0];

    agentName     = (researcher as any)?.agent_name ?? primary.business_name ?? undefined;
    meerkatRoleId = ((researcher as any)?.features as any)?.meerkat_role_id ?? null;
  }

  return (
    <div id="of-investigacion">
      <InvestigacionSection token={token} agentName={agentName} meerkatRoleId={meerkatRoleId} />
    </div>
  );
}

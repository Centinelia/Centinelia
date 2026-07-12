export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import OpsReportsSection     from '../../OpsReportsSection';

interface Props { params: Promise<{ token: string }> }

export default async function ReportesPage({ params }: Props) {
  const { token } = await params;

  const supabase    = createAdminClient();
  const { data: ag } = await supabase.from('voice_agents').select('portal_email').eq('portal_token', token).single();
  const { data: all } = ag?.portal_email
    ? await supabase.from('voice_agents').select('id, business_name, role').eq('portal_email', ag.portal_email)
    : { data: [] };

  const agents = (all ?? []).map((a: any) => ({
    id:            a.id,
    business_name: a.business_name,
    role:          a.role ?? null,
  }));

  return <div id="of-reportes"><OpsReportsSection token={token} agents={agents} /></div>;
}

import { getAgentByToken } from '@/lib/portal/org-token';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import SolucionFactibleSection from './SolucionFactibleSection';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const agent = await getAgentByToken<{ portal_email: string }>(token, 'portal_email');
  if (!agent) redirect('/portal');
  const supabase = createAdminClient();
  const { data: org } = await supabase.from('organizations')
    .select('invoicing_provider, invoicing_rfc_emisor, invoicing_razon_social, invoicing_regimen_fiscal, invoicing_lugar_expedicion, invoicing_test_mode, invoicing_allow_agent_cancellation, invoicing_csd_version, invoicing_csd_expires_at, invoicing_csd_no_certificado, invoicing_limits')
    .eq('portal_email', agent.portal_email)
    .single();

  return <SolucionFactibleSection token={token} org={org ?? {}} />;
}

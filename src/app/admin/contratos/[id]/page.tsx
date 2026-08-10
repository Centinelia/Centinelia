import { createAdminClient } from '@/lib/supabase/admin';
import { getOrgToken } from '@/lib/portal/org-token';
import { notFound } from 'next/navigation';
import ContratoEditor from './ContratoEditor';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContratoDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_name, portal_email, portal_token, contract_text, contract_accepted_at')
    .eq('id', id)
    .single();

  if (!agent) notFound();

  const orgToken = agent.portal_email ? await getOrgToken(agent.portal_email as string, supabase) : null;

  return <ContratoEditor agent={{ ...agent, org_token: orgToken }} />;
}

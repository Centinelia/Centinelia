import { createAdminClient } from '@/lib/supabase/admin';
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
    .select('id, business_name, client_name, portal_token, contract_text, contract_accepted_at')
    .eq('id', id)
    .single();

  if (!agent) notFound();

  return <ContratoEditor agent={agent} />;
}

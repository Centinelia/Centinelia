export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound }                     from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import ConsultarAgentChat, { type AgentOption } from '../../ConsultarAgentChat';

interface Props { params: Promise<{ token: string }> }

export default async function ConsultarPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();

  const { data: account } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!account) notFound();

  const { data: agents } = account.portal_email
    ? await supabase
        .from('voice_agents')
        .select('id, agent_name, role, business_name')
        .eq('portal_email', account.portal_email)
        .eq('active', true)
        .order('created_at', { ascending: true })
    : { data: [] };

  return <ConsultarAgentChat token={token} agents={(agents ?? []) as AgentOption[]} />;
}

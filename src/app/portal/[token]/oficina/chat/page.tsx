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
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  const isOwner = !session?.isSubUser;

  const supabase = createAdminClient();

  const { data: account } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!account) notFound();

  const [{ data: raw }, { data: opsAgents }] = await Promise.all([
    account.portal_email
      ? supabase.from('voice_agents').select('id, agent_name, role, business_name, features').eq('portal_email', account.portal_email).order('created_at', { ascending: true })
      : { data: [] },
    account.portal_email
      ? supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', account.portal_email)
      : { data: [] },
  ]);

  const agents: AgentOption[] = (raw ?? []).map((a: any) => ({
    id:            a.id,
    agent_name:    a.agent_name,
    role:          a.role,
    business_name: a.business_name,
    avatar_url:    (a.features?.avatar     as string | null) ?? null,
    role_color:    (a.features?.role_color as string | null) ?? null,
  }));

  const opsUsed  = (opsAgents ?? []).reduce((s: number, a: any) => s + (a.ai_ops_used  ?? 0), 0);
  const opsLimit = (opsAgents ?? []).reduce((s: number, a: any) => s + (a.ai_ops_limit ?? 0), 0);

  return <div id="of-chat"><ConsultarAgentChat token={token} agents={agents} opsUsed={opsUsed} opsLimit={opsLimit} isOwner={isOwner} /></div>;
}

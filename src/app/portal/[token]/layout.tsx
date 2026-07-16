import { createAdminClient } from '@/lib/supabase/admin';
import SupportChat       from './SupportChat';
import OpsAgentChatFab, { type AgentOption } from './OpsAgentChatFab';
import BugReportButton   from './BugReportButton';

export default async function TokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params:   Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = createAdminClient();
  const { data: account } = await supabase
    .from('voice_agents')
    .select('portal_email, allow_bug_reports')
    .eq('portal_token', token)
    .single();

  let opsAgents: AgentOption[] = [];
  if (account?.portal_email) {
    const { data } = await supabase
      .from('voice_agents')
      .select('id, agent_name, role, business_name, features')
      .eq('portal_email', account.portal_email)
      .eq('active', true)
      .not('role', 'is', null)
      .order('created_at', { ascending: true });
    opsAgents = (data ?? []).map((a: any) => ({
      id:            a.id,
      agent_name:    a.agent_name,
      role:          a.role,
      business_name: a.business_name,
      avatar_url:    (a.features?.avatar     as string | null) ?? null,
      role_color:    (a.features?.role_color as string | null) ?? null,
    })) as AgentOption[];
  }

  return (
    <>
      {children}
      <SupportChat />
      {opsAgents.length > 0 && <OpsAgentChatFab token={token} agents={opsAgents} />}
      {account?.allow_bug_reports && <BugReportButton token={token} />}
    </>
  );
}

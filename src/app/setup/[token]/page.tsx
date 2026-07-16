export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import SetupFlow from './SetupFlow';

interface Props { params: Promise<{ token: string }> }

export default async function SetupPage({ params }: Props) {
  const { token } = await params;

  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session       = await verifySession(sessionCookie);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, portal_email, onboarding_completed, business_description, role, agent_name')
    .eq('portal_token', token)
    .single();

  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail) {
    redirect('/portal/login');
  }

  // Sub-users go straight to the portal
  if (session?.isSubUser) redirect(`/portal/${token}`);

  // Already done — skip
  if ((agent as any).onboarding_completed === true) redirect(`/portal/${token}`);

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <SetupFlow
        token={token}
        businessName={agent.business_name}
        businessDesc={(agent as any).business_description ?? ''}
        agentRole={(agent as any).role ?? ''}
        agentName={(agent as any).agent_name ?? null}
      />
    </ThemeProvider>
  );
}

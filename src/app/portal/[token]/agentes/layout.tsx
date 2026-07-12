export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import ThemeToggle                      from '@/components/ThemeToggle';
import BusinessSwitcher                 from '../BusinessSwitcher';
import PortalLogout                     from '../PortalLogout';

import PortalSidebar                    from '../PortalSidebar';
import Link                             from 'next/link';
import { ArrowLeft }                    from 'lucide-react';

export default async function AgentesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { token } = (await params) as { token: string };

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, logo_url, portal_email, features, stripe_customer_id, minutes_included, minutes_used, ai_ops_used, ai_ops_limit')
    .eq('portal_token', token)
    .single();
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  const lookupEmail = session?.portalEmail ?? agent.portal_email ?? null;

  const { data: clientAgents } = lookupEmail
    ? await supabase
        .from('voice_agents')
        .select('business_name, logo_url, portal_token, role, features')
        .eq('portal_email', lookupEmail)
    : { data: [] };

  const allClientAgents = clientAgents ?? [];

  const businessGroups = [...new Map(
    allClientAgents.map((a: any) => [a.business_name, { // eslint-disable-line @typescript-eslint/no-explicit-any
      business_name: a.business_name,
      logo_url:      a.logo_url ?? null,
      first_token:   a.portal_token,
    }])
  ).values()];

  const hasOpsAgent  = allClientAgents.some((a: any) => !!(a.role as string | null)); // eslint-disable-line @typescript-eslint/no-explicit-any
  const showOutbound = !!(agent.features as any)?.outbound_calls; // eslint-disable-line @typescript-eslint/no-explicit-any
  const hasStripe    = !!(agent as any).stripe_customer_id;

  // Usage data
  const { data: acctMins } = lookupEmail
    ? await supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', lookupEmail).single()
    : { data: null };
  const minutesIncluded = (acctMins?.minutes_included ?? (agent as any).minutes_included ?? 0) as number;
  const minutesUsed     = (acctMins?.minutes_used     ?? (agent as any).minutes_used     ?? 0) as number;
  const minutesRemain   = Math.max(0, minutesIncluded - minutesUsed);

  const { data: opsAgents } = lookupEmail
    ? await supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', lookupEmail)
    : { data: null };
  const aiOpsUsed  = ((opsAgents ?? []) as any[]).reduce((s, a) => s + (((a as any).ai_ops_used  as number) ?? 0), 0);
  const aiOpsLimit = ((opsAgents ?? []) as any[]).reduce((s, a) => s + (((a as any).ai_ops_limit as number) ?? 0), 0);

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid rgba(108,59,255,0.18)', boxShadow: '0 2px 24px rgba(0,0,0,0.18)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <BusinessSwitcher
              current={{ business_name: agent.business_name, logo_url: (agent as any).logo_url ?? null, first_token: token }} // eslint-disable-line @typescript-eslint/no-explicit-any
              options={businessGroups}
              currentBusinessName={agent.business_name}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
              <PortalLogout />
            </div>
          </div>
        </div>

        {/* Mobile breadcrumb */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2.5"
          style={{ background: 'var(--c-modal)', borderBottom: '1px solid var(--c-border)' }}>
          <Link href={`/portal/${token}?tab=inicio`}
            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--c-text-3)' }}>
            <ArrowLeft size={12} />
            Portal
          </Link>
          <span style={{ color: 'var(--c-text-4)' }}>/</span>
          <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>Mis Agentes</span>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex min-h-[calc(100vh-53px)]">
          <PortalSidebar
            token={token}
            currentTab="agentes"
            hasOpsAgent={hasOpsAgent}
            showOutbound={showOutbound}
            hasStripe={hasStripe}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
          />
          <div className="flex-1 min-w-0 px-4 sm:px-6 py-6">
            {children}
          </div>
        </div>

      </div>
    </ThemeProvider>
  );
}

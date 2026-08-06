export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import BusinessSwitcher                 from '../BusinessSwitcher';
import PortalLogout                     from '../PortalLogout';

import OficinaSidebar                   from './OficinaSidebar';
import OficinaSidebarV2                 from './OficinaSidebarV2';
import OficinaHeaderDark                from './OficinaHeaderDark';
import OficinaMobileNav                 from './OficinaMobileNav';
import NotificationBell                 from '../NotificationBell';
import PortalFooter                     from '../PortalFooter';
import Link                             from 'next/link';
import { ArrowLeft }                    from 'lucide-react';
import { isPortalV2Enabled }            from '@/lib/portal/portal-v2-flag';

// Next.js 15 generates Promise<unknown> for nested layout params;
// use Promise<any> so the type is compatible at the call site.
export default async function OficinaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Promise<any>;
}) {
  const { token } = (await params) as { token: string };

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, logo_url, portal_email, minutes_included, minutes_used, ai_ops_used, ai_ops_limit, stripe_customer_id, features, agent_name')
    .eq('portal_token', token)
    .single();
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  const lookupEmail = session?.portalEmail ?? agent.portal_email ?? null;

  // Usage data — account-level pool
  const { data: acctMins } = lookupEmail
    ? await supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', lookupEmail).single()
    : { data: null };
  const minutesIncluded = (acctMins?.minutes_included ?? (agent as any).minutes_included ?? 0) as number;
  const minutesUsed     = (acctMins?.minutes_used     ?? (agent as any).minutes_used     ?? 0) as number;
  const minutesRemain   = Math.max(0, minutesIncluded - minutesUsed);

  const { data: opsAgents } = lookupEmail
    ? await supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', lookupEmail)
    : { data: null };
  const aiOpsUsed  = ((opsAgents ?? []) as any[]).reduce((s, a) => s + ((a.ai_ops_used  as number) ?? 0), 0);
  const aiOpsLimit = ((opsAgents ?? []) as any[]).reduce((s, a) => s + ((a.ai_ops_limit as number) ?? 0), 0);
  const hasStripe  = !!(agent as any).stripe_customer_id;
  const vertical   = ((agent as any).features as any)?.vertical as string | undefined;
  const modules    = session?.isSubUser ? (session.modules ?? []) : undefined;

  // V2 flag
  const v2Enabled = agent.portal_email
    ? await isPortalV2Enabled(agent.portal_email)
    : false;

  // Business switcher options
  const { data: clientAgents } = lookupEmail
    ? await supabase.from('voice_agents').select('business_name, logo_url, portal_token').eq('portal_email', lookupEmail)
    : { data: [] };

  const businessGroups = [...new Map(
    (clientAgents ?? []).map((a: any) => [a.business_name, {
      business_name: a.business_name,
      logo_url:      a.logo_url ?? null,
      first_token:   a.portal_token,
    }])
  ).values()];

  // ── Unread badge counts ──────────────────────────────────────────────────
  const badges: Record<string, number> = { bandeja: 0, contratos: 0, juntas: 0, reportes: 0 };

  if (lookupEmail) {
    try {
      const { data: aIds } = await supabase
        .from('voice_agents').select('id').eq('portal_email', lookupEmail);
      const agentIds = (aIds ?? []).map((a: any) => a.id as string);

      if (agentIds.length > 0) {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

        const [inboxR, contractR, meetingR] = await Promise.all([
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'inbox'),
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'contract'),
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'meeting'),
        ]);

        const readInbox    = (inboxR.data    ?? []).map((r: any) => r.item_id as string);
        const readContract = (contractR.data ?? []).map((r: any) => r.item_id as string);
        const readMeeting  = (meetingR.data  ?? []).map((r: any) => r.item_id as string);

        let inboxQ = supabase.from('ops_inbox')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds)
          .in('status', ['pending', 'escalated', 'info_requested'])
          .gte('created_at', cutoff);
        if (readInbox.length > 0)
          inboxQ = inboxQ.not('id', 'in', `(${readInbox.join(',')})`);
        const { count: ic } = await inboxQ;

        const { count: hrc } = await supabase
          .from('human_requests')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds)
          .in('status', ['pending', 'escalated'])
          .gte('created_at', cutoff);

        badges.bandeja = (ic ?? 0) + (hrc ?? 0);

        let contractQ = supabase.from('ops_contracts')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).gte('created_at', cutoff);
        if (readContract.length > 0)
          contractQ = contractQ.not('id', 'in', `(${readContract.join(',')})`);
        const { count: cc } = await contractQ;
        badges.contratos = cc ?? 0;

        let meetingQ = supabase.from('ops_meetings')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'done').gte('created_at', cutoff);
        if (readMeeting.length > 0)
          meetingQ = meetingQ.not('id', 'in', `(${readMeeting.join(',')})`);
        const { count: mc } = await meetingQ;
        badges.juntas = mc ?? 0;

        const { count: hrc2 } = await supabase
          .from('heartbeat_runs')
          .select('id', { count: 'exact', head: true })
          .eq('portal_email', lookupEmail)
          .is('read_at', null)
          .gte('ran_at', cutoff);
        badges.reportes = hrc2 ?? 0;
      }
    } catch {
      // portal_read_receipts table may not exist yet; badges default to 0
    }
  }

  // ── V2 shell: header dark 48px + sidebar dark 260px + content light ────
  if (v2Enabled) {
    return (
      <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
        <div className="min-h-screen flex flex-col" style={{ background: '#FAFAFB', color: 'var(--c-text)' }}>
          <OficinaHeaderDark
            token={token}
            businessName={agent.business_name}
            logoUrl={(agent as any).logo_url ?? null}
            businessOptions={businessGroups}
          />

          <div className="flex flex-1 min-h-0">
            <OficinaSidebarV2
              token={token}
              badges={badges}
              minutesRemain={minutesRemain}
              minutesIncluded={minutesIncluded}
              aiOpsUsed={aiOpsUsed}
              aiOpsLimit={aiOpsLimit}
              hasStripe={hasStripe}
              vertical={vertical}
              modules={modules}
            />
            <main className="flex-1 min-w-0 flex flex-col">
              <div className="px-4 sm:px-6 py-6 flex-1">
                {children}
              </div>
              <PortalFooter token={token} />
            </main>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // ── V1 layout (legacy — se eliminará pronto) ─────────────────────────────
  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen relative flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)', overflowX: 'clip' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid rgba(108,59,255,0.18)', boxShadow: '0 2px 24px rgba(0,0,0,0.18)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <OficinaMobileNav
                token={token}
                badges={badges}
                minutesRemain={minutesRemain}
                minutesIncluded={minutesIncluded}
                aiOpsUsed={aiOpsUsed}
                aiOpsLimit={aiOpsLimit}
                hasStripe={hasStripe}
                vertical={vertical}
                modules={modules}
              />
              <BusinessSwitcher
                current={{ business_name: agent.business_name, logo_url: (agent as any).logo_url ?? null, first_token: token }}
                options={businessGroups}
                currentBusinessName={agent.business_name}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <NotificationBell token={token} />
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
          <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>Oficina</span>
        </div>

        {/* Body — sidebar is position:fixed, main content has md:pl-[260px] to compensate */}
        <div className="flex flex-1">
          <OficinaSidebar
            token={token}
            badges={badges}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
            hasStripe={hasStripe}
            vertical={vertical}
            modules={modules}
          />
          <div className="flex-1 min-w-0 flex flex-col md:pl-[260px]">
            <div className="px-4 sm:px-6 py-6 flex-1">
              {children}
            </div>
            <PortalFooter token={token} />
          </div>
        </div>

      </div>
    </ThemeProvider>
  );
}

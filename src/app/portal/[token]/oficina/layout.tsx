export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import ThemeToggle                      from '@/components/ThemeToggle';
import BusinessSwitcher                 from '../BusinessSwitcher';
import PortalLogout                     from '../PortalLogout';

import OficinaSidebar                   from './OficinaSidebar';
import NotificationBell                 from '../NotificationBell';
import PortalFooter                     from '../PortalFooter';
import Link                             from 'next/link';
import { ArrowLeft }                    from 'lucide-react';

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
    .select('business_name, logo_url, portal_email, minutes_included, minutes_used, ai_ops_used, ai_ops_limit, stripe_customer_id')
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
  const badges: Record<string, number> = { bandeja: 0, contratos: 0, juntas: 0 };

  if (lookupEmail) {
    try {
      // Agent IDs for this account
      const { data: aIds } = await supabase
        .from('voice_agents').select('id').eq('portal_email', lookupEmail);
      const agentIds = (aIds ?? []).map((a: any) => a.id as string);

      if (agentIds.length > 0) {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

        // Read receipts per type
        const [inboxR, contractR, meetingR] = await Promise.all([
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'inbox'),
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'contract'),
          supabase.from('portal_read_receipts').select('item_id').eq('portal_email', lookupEmail).eq('item_type', 'meeting'),
        ]);

        const readInbox    = (inboxR.data    ?? []).map((r: any) => r.item_id as string);
        const readContract = (contractR.data ?? []).map((r: any) => r.item_id as string);
        const readMeeting  = (meetingR.data  ?? []).map((r: any) => r.item_id as string);

        // Unread inbox (pending, last 30 days)
        let inboxQ = supabase.from('ops_inbox')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'pending').gte('created_at', cutoff);
        if (readInbox.length > 0)
          inboxQ = inboxQ.not('id', 'in', `(${readInbox.join(',')})`);
        const { count: ic } = await inboxQ;
        badges.bandeja = ic ?? 0;

        // Unread contracts (new in last 30 days)
        let contractQ = supabase.from('ops_contracts')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).gte('created_at', cutoff);
        if (readContract.length > 0)
          contractQ = contractQ.not('id', 'in', `(${readContract.join(',')})`);
        const { count: cc } = await contractQ;
        badges.contratos = cc ?? 0;

        // Unread meetings (done, last 30 days)
        let meetingQ = supabase.from('ops_meetings')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'done').gte('created_at', cutoff);
        if (readMeeting.length > 0)
          meetingQ = meetingQ.not('id', 'in', `(${readMeeting.join(',')})`);
        const { count: mc } = await meetingQ;
        badges.juntas = mc ?? 0;
      }
    } catch {
      // portal_read_receipts table may not exist yet; badges default to 0
    }
  }

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        {/* Header */}
        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid rgba(108,59,255,0.18)', boxShadow: '0 2px 24px rgba(0,0,0,0.18)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <BusinessSwitcher
              current={{ business_name: agent.business_name, logo_url: (agent as any).logo_url ?? null, first_token: token }}
              options={businessGroups}
              currentBusinessName={agent.business_name}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <NotificationBell token={token} />
              <ThemeToggle />
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

        {/* Body */}
        <div className="flex min-h-[calc(100vh-53px)]">
          <OficinaSidebar
            token={token}
            badges={badges}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
            hasStripe={hasStripe}
          />
          <div className="flex-1 min-w-0 flex flex-col max-w-4xl">
            <div className="px-4 sm:px-6 py-6 flex-1">
              {children}
            </div>
            <PortalFooter />
          </div>
        </div>

      </div>
    </ThemeProvider>
  );
}

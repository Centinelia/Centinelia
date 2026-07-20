export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import { PhoneOutgoing }               from 'lucide-react';
import ThemeToggle                     from '@/components/ThemeToggle';

import PortalLogout      from '../../PortalLogout';
import PortalSidebar     from '../../PortalSidebar';
import PortalFooter      from '../../PortalFooter';
import BusinessSwitcher  from '../../BusinessSwitcher';
import OutboundToggles  from '../../OutboundToggles';
import OutboundSection  from '../../OutboundSection';
import type { ContactOutbound } from '../../PortalContactsSection';

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}

export default async function SalientesPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { view }  = await searchParams;

  const cookieStore   = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_COOKIE)?.value ?? '';
  const session       = await verifySession(sessionCookie);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('portal_token', token).single();
  if (!agent) notFound();

  if (session?.portalEmail && agent.portal_email && agent.portal_email !== session.portalEmail)
    redirect('/portal/login');

  const lookupEmail = session?.portalEmail ?? (agent as any).portal_email ?? null;
  const { data: clientAgents } = lookupEmail
    ? await supabase.from('voice_agents').select('id, agent_name, business_name, features, role').eq('portal_email', lookupEmail)
    : { data: [] };
  const allClientAgents = clientAgents ?? [];

  const features     = (agent.features ?? {}) as Record<string, unknown>;
  const showOutbound = !!(features.outbound_calls) || agent.plan === 'pro';
  const hasOpsAgent  = (allClientAgents as any[]).some((a: any) => a.role) || !!(agent as any).role;

  if (!showOutbound) redirect(`/portal/${token}/llamadas/entrantes`);

  const [acctMinsRes, opsAgentsRes, contactOutboundRes, outboundCampaignsRes] = await Promise.all([
    (agent as any).portal_email
      ? supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', (agent as any).portal_email).single()
      : Promise.resolve({ data: null }),
    (agent as any).portal_email
      ? supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', (agent as any).portal_email)
      : Promise.resolve({ data: null }),
    supabase.from('outbound_contacts').select('id, nombre, telefono, motivo, source, status, fail_count, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('outbound_campaigns').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }),
  ]);

  const acctMins        = (acctMinsRes as any).data;
  const opsAgents       = (opsAgentsRes as any).data ?? [];
  const minutesIncluded = acctMins?.minutes_included ?? (agent as any).minutes_included ?? 0;
  const minutesUsed     = acctMins?.minutes_used     ?? (agent as any).minutes_used     ?? 0;
  const minutesRemain   = Math.max(0, minutesIncluded - minutesUsed);
  const aiOpsUsed       = (opsAgents as any[]).reduce((s: number, a: any) => s + ((a.ai_ops_used  as number) ?? 0), 0);
  const aiOpsLimit      = (opsAgents as any[]).reduce((s: number, a: any) => s + ((a.ai_ops_limit as number) ?? 0), 0);
  const hasStripe       = !!(agent as any).stripe_customer_id;

  const contactOutbound   = (contactOutboundRes.data   ?? []) as ContactOutbound[];
  const outboundCampaigns = outboundCampaignsRes.data  ?? [];

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="light">
      <div className="min-h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid rgba(108,59,255,0.18)', boxShadow: '0 2px 24px rgba(0,0,0,0.18)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <BusinessSwitcher
              current={{ business_name: agent.business_name, logo_url: (agent as any).logo_url ?? null, first_token: token }}
              options={[{ business_name: agent.business_name, logo_url: (agent as any).logo_url ?? null, first_token: token }]}
              currentBusinessName={agent.business_name}
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
              <PortalLogout />
            </div>
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-53px)]">
          <PortalSidebar
            token={token}
            currentTab="oficina"
            hasOpsAgent={hasOpsAgent}
            showOutbound={showOutbound}
            hasStripe={hasStripe}
            minutesRemain={minutesRemain}
            minutesIncluded={minutesIncluded}
            aiOpsUsed={aiOpsUsed}
            aiOpsLimit={aiOpsLimit}
          />

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-4 sm:px-6 py-6 flex flex-col gap-5 flex-1">

              <div className="flex items-center gap-2">
                <PhoneOutgoing size={15} style={{ color: '#a855f7' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Llamadas salientes</h2>
              </div>

              <div id="llamadas-sal">
                <OutboundToggles
                  token={token}
                  initOutbound={!!(features.outbound_calls)}
                  initMissedCallRecovery={!!(agent as any).missed_call_recovery}
                />
              </div>

              {!!(features.outbound_calls) && (
                <OutboundSection
                  token={token}
                  initialContacts={contactOutbound as any[]}
                  initialCampaigns={outboundCampaigns as any[]}
                  agents={allClientAgents
                    .filter(a => !!(a.features as any)?.outbound_calls)
                    .map(a => ({ id: a.id, agent_name: a.agent_name ?? null, business_name: a.business_name }))}
                  initialTab={view === 'campanas' ? 'campanas' : 'contactos'}
                />
              )}

            </div>
            <PortalFooter token={token} />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import Link                             from 'next/link';
import { ChevronLeft, PhoneOutgoing }   from 'lucide-react';
import ThemeToggle                      from '@/components/ThemeToggle';

import PortalLogout     from '../../PortalLogout';
import PortalSidebar    from '../../PortalSidebar';
import OutboundToggles  from '../../OutboundToggles';
import OutboundSection  from '../../OutboundSection';
import type { ContactOutbound } from '../../PortalContactsSection';

interface Props { params: Promise<{ token: string }> }

export default async function SalientesPage({ params }: Props) {
  const { token } = await params;

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

  const [contactOutboundRes, outboundCampaignsRes] = await Promise.all([
    supabase.from('outbound_contacts').select('id, nombre, telefono, motivo, source, status, fail_count, created_at').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('outbound_campaigns').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }),
  ]);

  const contactOutbound   = (contactOutboundRes.data   ?? []) as ContactOutbound[];
  const outboundCampaigns = outboundCampaignsRes.data  ?? [];

  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
      <div className="min-h-screen" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

        <div style={{ background: 'var(--c-modal)', borderBottom: '1px solid var(--c-border)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link href={`/portal/${token}`} className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70" style={{ color: 'var(--c-text-2)' }}>
              <ChevronLeft size={16} /> Portal
            </Link>
            <div className="flex items-center gap-1.5">
              <ThemeToggle className="!text-[var(--c-text-2)] !bg-[var(--c-surface-2)]" />
              <PortalLogout />
            </div>
          </div>
        </div>

        <div className="flex min-h-[calc(100vh-53px)]">
          <PortalSidebar token={token} currentTab="llamadas" hasOpsAgent={hasOpsAgent} showOutbound={showOutbound} />

          <div className="flex-1 min-w-0 px-4 sm:px-6 py-6 flex flex-col gap-5">

            <div className="flex items-center gap-2">
              <PhoneOutgoing size={15} style={{ color: '#a855f7' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Llamadas salientes</h2>
            </div>

            <OutboundToggles
              token={token}
              initOutbound={!!(features.outbound_calls)}
              initMissedCallRecovery={!!(agent as any).missed_call_recovery}
            />

            {!!(features.outbound_calls) && (
              <OutboundSection
                token={token}
                initialContacts={contactOutbound as any[]}
                initialCampaigns={outboundCampaigns as any[]}
                agents={allClientAgents
                  .filter(a => !!(a.features as any)?.outbound_calls)
                  .map(a => ({ id: a.id, agent_name: a.agent_name ?? null, business_name: a.business_name }))}
              />
            )}

          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

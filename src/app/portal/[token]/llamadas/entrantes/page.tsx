export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import { PhoneCall }      from 'lucide-react';
import ThemeToggle        from '@/components/ThemeToggle';
import type { VoiceCall } from '@/types/agent';

import PortalLogout     from '../../PortalLogout';
import PortalSidebar    from '../../PortalSidebar';
import PortalFooter     from '../../PortalFooter';
import BusinessSwitcher from '../../BusinessSwitcher';
import CallsSearch     from '../../CallsSearch';
import DownloadCallsCSV from '../../DownloadCallsCSV';
import LeadsTabsSection from './LeadsTabsSection';

interface Props { params: Promise<{ token: string }> }

export default async function EntrantesPage({ params }: Props) {
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
    ? await supabase.from('voice_agents').select('id, role').eq('portal_email', lookupEmail)
    : { data: [] };

  const features    = (agent.features ?? {}) as Record<string, unknown>;
  const showLeads   = !!features.lead_qualification;
  const showOrders  = !!features.order_taking;
  const showAppts   = !!features.appointment_booking;
  const showOutbound = !!(features.outbound_calls) || agent.plan === 'pro';
  const hasOpsAgent = (clientAgents ?? []).some((a: any) => a.role) || !!(agent as any).role;

  const [acctMinsRes, opsAgentsRes, callsRes, leadsRes, ordersRes, apptsRes] = await Promise.all([
    (agent as any).portal_email
      ? supabase.from('account_minutes').select('minutes_used, minutes_included').eq('portal_email', (agent as any).portal_email).single()
      : Promise.resolve({ data: null }),
    (agent as any).portal_email
      ? supabase.from('voice_agents').select('ai_ops_used, ai_ops_limit').eq('portal_email', (agent as any).portal_email)
      : Promise.resolve({ data: null }),
    supabase.from('voice_calls').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(200),
    showLeads  ? supabase.from('leads_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false })        : Promise.resolve({ data: [] }),
    showOrders ? supabase.from('orders_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false })       : Promise.resolve({ data: [] }),
    showAppts  ? supabase.from('appointments_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  const acctMins        = (acctMinsRes as any).data;
  const opsAgents       = (opsAgentsRes as any).data ?? [];
  const minutesIncluded = acctMins?.minutes_included ?? (agent as any).minutes_included ?? 0;
  const minutesUsed     = acctMins?.minutes_used     ?? (agent as any).minutes_used     ?? 0;
  const minutesRemain   = Math.max(0, minutesIncluded - minutesUsed);
  const aiOpsUsed       = (opsAgents as any[]).reduce((s: number, a: any) => s + ((a.ai_ops_used  as number) ?? 0), 0);
  const aiOpsLimit      = (opsAgents as any[]).reduce((s: number, a: any) => s + ((a.ai_ops_limit as number) ?? 0), 0);
  const hasStripe       = !!(agent as any).stripe_customer_id;

  const calls  = (callsRes.data  ?? []) as VoiceCall[];
  const leads  = leadsRes.data   ?? [];
  const orders = ordersRes.data  ?? [];
  const appts  = apptsRes.data   ?? [];

  const normPhone = (p: string) => (p ?? '').replace(/\D/g, '');
  const callerNames: Record<string, string> = {};
  for (const l of leads  as any[]) { if (l.whatsapp && l.nombre) { const k = normPhone(l.whatsapp); if (k && !callerNames[k]) callerNames[k] = l.nombre; } }
  for (const a of appts  as any[]) { if (a.telefono && a.nombre) { const k = normPhone(a.telefono); if (k && !callerNames[k]) callerNames[k] = a.nombre; } }
  for (const o of orders as any[]) { if (o.telefono && o.nombre) { const k = normPhone(o.telefono); if (k && !callerNames[k]) callerNames[k] = o.nombre; } }


  return (
    <ThemeProvider storageKey="centinelia-portal-theme" defaultTheme="dark">
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
                <PhoneCall size={15} style={{ color: '#6C3BFF' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Llamadas entrantes</h2>
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                  {calls.length}
                </span>
              </div>

              <div id="registro" className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
                    Registro de llamadas
                  </h3>
                  <DownloadCallsCSV calls={calls} filename={`llamadas-${agent.business_name.replace(/\s+/g, '-').toLowerCase()}.csv`} />
                </div>
                {calls.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}>
                      <PhoneCall size={20} style={{ color: '#6C3BFF', opacity: 0.5 }} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin llamadas todavía</p>
                  </div>
                ) : (
                  <CallsSearch calls={calls as any} isPro={agent.plan === 'pro'} callerNames={callerNames} token={token} />
                )}
              </div>

              {(showLeads || showOrders || showAppts) && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Capturas desde el inicio</p>
                  <LeadsTabsSection
                    token={token}
                    isPro={agent.plan === 'pro'}
                    leads={leads as any}
                    orders={orders as any}
                    appts={appts as any}
                    showLeads={showLeads}
                    showOrders={showOrders}
                    showAppts={showAppts}
                    businessName={agent.business_name}
                  />
                </div>
              )}

            </div>
            <PortalFooter />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

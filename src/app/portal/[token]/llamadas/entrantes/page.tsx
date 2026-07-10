export const dynamic = 'force-dynamic';

import { createAdminClient }            from '@/lib/supabase/admin';
import { notFound, redirect }           from 'next/navigation';
import { cookies }                      from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { ThemeProvider }                from '@/components/ThemeProvider';
import Link                             from 'next/link';
import { ChevronLeft, PhoneCall, Users, ShoppingBag, CalendarDays } from 'lucide-react';
import ThemeToggle                      from '@/components/ThemeToggle';
import type { VoiceCall }               from '@/types/agent';

import PortalLogout              from '../../PortalLogout';
import PortalSidebar             from '../../PortalSidebar';
import CallsSearch               from '../../CallsSearch';
import DownloadCallsCSV          from '../../DownloadCallsCSV';
import CollapsibleSection        from '../../CollapsibleSection';
import PortalLeadsSection        from '../../PortalLeadsSection';
import PortalOrdersSection       from '../../PortalOrdersSection';
import PortalAppointmentsSection from '../../PortalAppointmentsSection';

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

  const [callsRes, leadsRes, ordersRes, apptsRes] = await Promise.all([
    supabase.from('voice_calls').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(200),
    showLeads  ? supabase.from('leads_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false })        : Promise.resolve({ data: [] }),
    showOrders ? supabase.from('orders_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false })       : Promise.resolve({ data: [] }),
    showAppts  ? supabase.from('appointments_voice').select('*').eq('agent_id', agent.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  const calls  = (callsRes.data  ?? []) as VoiceCall[];
  const leads  = leadsRes.data   ?? [];
  const orders = ordersRes.data  ?? [];
  const appts  = apptsRes.data   ?? [];

  const normPhone = (p: string) => (p ?? '').replace(/\D/g, '');
  const callerNames: Record<string, string> = {};
  for (const l of leads  as any[]) { if (l.whatsapp && l.nombre) { const k = normPhone(l.whatsapp); if (k && !callerNames[k]) callerNames[k] = l.nombre; } }
  for (const a of appts  as any[]) { if (a.telefono && a.nombre) { const k = normPhone(a.telefono); if (k && !callerNames[k]) callerNames[k] = a.nombre; } }
  for (const o of orders as any[]) { if (o.telefono && o.nombre) { const k = normPhone(o.telefono); if (k && !callerNames[k]) callerNames[k] = o.nombre; } }

  const visibleCaptures = ([
    showOrders && orders.length > 0 && { count: orders.length, el: (
      <CollapsibleSection key="orders" title="Pedidos" icon={<ShoppingBag size={14} />} defaultOpen count={orders.length}>
        <PortalOrdersSection initialOrders={orders as any} token={token} isPro={agent.plan === 'pro'} />
      </CollapsibleSection>
    )},
    showAppts && appts.length > 0 && { count: appts.length, el: (
      <CollapsibleSection key="appts" title="Citas" icon={<CalendarDays size={14} />} defaultOpen count={appts.length}>
        <PortalAppointmentsSection initialAppointments={appts as any} token={token} label="cita" isPro={agent.plan === 'pro'} />
      </CollapsibleSection>
    )},
    showLeads && leads.length > 0 && { count: leads.length, el: (
      <CollapsibleSection key="leads" title="Leads" icon={<Users size={14} />} defaultOpen count={leads.length}>
        <PortalLeadsSection initialLeads={leads as any} token={token} isPro={agent.plan === 'pro'}
          filename={`leads-${agent.business_name.replace(/\s+/g, '-').toLowerCase()}.csv`} />
      </CollapsibleSection>
    )},
  ] as ({ count: number; el: React.ReactNode } | false)[])
    .filter((s): s is { count: number; el: React.ReactNode } => !!s)
    .sort((a, b) => b.count - a.count);

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

            {visibleCaptures.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Capturas desde el inicio</p>
                {visibleCaptures.map(s => s.el)}
              </div>
            )}

          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

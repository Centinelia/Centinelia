export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound }          from 'next/navigation';
import type { VoiceCall }    from '@/types/agent';
import LlamadasTabs          from './LlamadasTabs';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaLlamadasPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('portal_token', token).single();
  if (!agent) notFound();

  const lookupEmail    = (agent as any).portal_email as string | null;
  const { data: peers } = lookupEmail
    ? await supabase.from('voice_agents').select('id, agent_name, business_name, features, role').eq('portal_email', lookupEmail)
    : { data: [] };
  const allPeers = peers ?? [];

  const agentIds = allPeers.length > 0 ? allPeers.map(a => a.id as string) : [agent.id as string];

  const anyHas = (key: string) => allPeers.some(a => !!((a.features as any)?.[key]));

  const features       = ((agent as any).features ?? {}) as Record<string, unknown>;
  const showLeads      = !!features.lead_qualification  || anyHas('lead_qualification');
  const showOrders     = !!features.order_taking        || anyHas('order_taking');
  const showAppts      = !!features.appointment_booking || anyHas('appointment_booking');
  const showOutbound   = !!(features.outbound_calls)    || anyHas('outbound_calls') || agent.plan === 'pro';
  const initOutbound   = !!(features.outbound_calls);
  const initMissedCall = !!((agent as any).missed_call_recovery);

  const [callsRes, leadsRes, ordersRes, apptsRes, contactsRes, campaignsRes] = await Promise.all([
    supabase.from('voice_calls').select('*').in('agent_id', agentIds).order('created_at', { ascending: false }).limit(200),
    showLeads    ? supabase.from('leads_voice').select('*').in('agent_id', agentIds).order('created_at', { ascending: false })        : Promise.resolve({ data: [] }),
    showOrders   ? supabase.from('orders_voice').select('*').in('agent_id', agentIds).order('created_at', { ascending: false })       : Promise.resolve({ data: [] }),
    showAppts    ? supabase.from('appointments_voice').select('*').in('agent_id', agentIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    showOutbound ? supabase.from('outbound_contacts').select('id,nombre,telefono,motivo,source,status,fail_count,created_at').in('agent_id', agentIds).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    showOutbound ? supabase.from('outbound_campaigns').select('*').in('agent_id', agentIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);

  const calls    = (callsRes.data  ?? []) as VoiceCall[];
  const leads    = leadsRes.data   ?? [];
  const orders   = ordersRes.data  ?? [];
  const appts    = apptsRes.data   ?? [];

  // Build caller name lookup from captured data
  const normPhone = (p: string) => (p ?? '').replace(/\D/g, '');
  const callerNames: Record<string, string> = {};
  for (const l of leads  as any[]) { if (l.whatsapp && l.nombre) { const k = normPhone(l.whatsapp); if (k && !callerNames[k]) callerNames[k] = l.nombre; } }
  for (const a of appts  as any[]) { if (a.telefono && a.nombre) { const k = normPhone(a.telefono); if (k && !callerNames[k]) callerNames[k] = a.nombre; } }
  for (const o of orders as any[]) { if (o.telefono && o.nombre) { const k = normPhone(o.telefono); if (k && !callerNames[k]) callerNames[k] = o.nombre; } }

  const outboundAgents = allPeers
    .filter(a => !!((a.features as any)?.outbound_calls))
    .map(a => ({ id: a.id, agent_name: (a as any).agent_name ?? null, business_name: a.business_name }));

  return (
    <div id="of-llamadas" className="flex flex-col gap-5 p-4 md:p-6">
      <LlamadasTabs
        token={token}
        isPro={agent.plan === 'pro'}
        businessName={agent.business_name}
        agentName={(agent as any).agent_name ?? agent.business_name}
        calls={calls}
        leads={leads as any[]}
        orders={orders as any[]}
        appts={appts as any[]}
        showLeads={showLeads}
        showOrders={showOrders}
        showAppts={showAppts}
        showOutbound={showOutbound}
        initOutbound={initOutbound}
        initMissedCall={initMissedCall}
        contactOutbound={contactsRes.data ?? []}
        outboundCampaigns={campaignsRes.data ?? []}
        outboundAgents={outboundAgents}
        callerNames={callerNames}
      />
    </div>
  );
}

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import type { VoiceCall }    from '@/types/agent';
import LlamadasTabs          from './LlamadasTabs';

export type LlamadasFiltro = 'entrantes' | 'salientes' | 'recovery';

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ filtro?: string }>;
}

export default async function OficinaLlamadasPage({ params, searchParams }: Props) {
  const { token }  = await params;
  const { filtro: filtroRaw } = await searchParams;

  // Retrocompat: ?filtro=campanas ahora vive en /oficina/campanas
  if (filtroRaw === 'campanas') {
    redirect(`/portal/${token}/oficina/campanas`);
  }

  const filtro: LlamadasFiltro =
    filtroRaw === 'salientes' || filtroRaw === 'recovery'
      ? (filtroRaw as LlamadasFiltro)
      : 'entrantes';

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

  // Fetch data conditionally based on active filter tab to avoid unnecessary queries
  const needsInbound  = filtro === 'entrantes';
  const needsOutbound = filtro === 'salientes';

  const [callsRes, leadsRes, ordersRes, apptsRes, outboundHistoryRes] = await Promise.all([
    // Always fetch calls for entrantes (default); skip for outbound-only tabs
    needsInbound
      ? supabase.from('voice_calls').select('*').in('agent_id', agentIds).order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    showLeads && needsInbound
      ? supabase.from('leads_voice').select('*').in('agent_id', agentIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    showOrders && needsInbound
      ? supabase.from('orders_voice').select('*').in('agent_id', agentIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    showAppts && needsInbound
      ? supabase.from('appointments_voice').select('*').in('agent_id', agentIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    // Historial de llamadas salientes ya realizadas (para tab Salientes)
    showOutbound && needsOutbound
      ? supabase.from('outbound_calls')
          .select('id,agent_id,telefono,nombre,motivo,status,called_at,completed_at,duration_sec,ended_reason,campaign_id')
          .in('agent_id', agentIds)
          .order('called_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const calls    = (callsRes.data  ?? []) as VoiceCall[];
  const leads    = leadsRes.data   ?? [];
  const orders   = ordersRes.data  ?? [];
  const appts    = apptsRes.data   ?? [];

  // Build caller name lookup from captured data. Requiere ≥7 dígitos para
  // evitar que teléfonos parciales o ruidosos (ej. "N/A" → "") mapeen a un
  // nombre y ese nombre aparezca en llamadas de otros contactos.
  const normPhone = (p: string) => (p ?? '').replace(/\D/g, '');
  const callerNames: Record<string, string> = {};
  const addName = (rawPhone: unknown, name: unknown) => {
    if (typeof rawPhone !== 'string' || typeof name !== 'string' || !name.trim()) return;
    const k = normPhone(rawPhone);
    if (k.length < 7) return;
    if (!callerNames[k]) callerNames[k] = name.trim();
  };
  for (const l of leads  as any[]) addName(l.whatsapp, l.nombre);
  for (const a of appts  as any[]) addName(a.telefono, a.nombre);
  for (const o of orders as any[]) addName(o.telefono, o.nombre);

  // Map agent_id → agent_name para que cada llamada muestre quién realmente la
  // atendió. Antes se pasaba un único agentName basado en el token del portal,
  // así que en cuentas con varios empleados todas las llamadas aparecían como
  // atendidas por el mismo agente.
  const agentNameById: Record<string, string> = {};
  for (const p of allPeers) {
    const id   = p.id as string | undefined;
    const name = ((p as any).agent_name ?? p.business_name) as string | undefined;
    if (id && name) agentNameById[id] = name;
  }

  const outboundAgents = allPeers
    .filter(a => !!((a.features as any)?.outbound_calls))
    .map(a => ({
      id:              a.id,
      agent_name:      (a as any).agent_name ?? null,
      business_name:   a.business_name,
      features:        (a.features as any) ?? null,
      meerkat_role_id: (a as any).meerkat_role_id ?? (a.features as any)?.meerkat_role_id ?? null,
    }));

  // ── Counters para el hero (server-side) ────────────────────────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo    = new Date(Date.now() - 7 * 86400000);

  // Fallback graceful: si CUALQUIER count falla (RLS, tabla missing, timeout)
  // caemos a { count: 0 } en vez de que Promise.all rechace y tumbe la página.
  const safeCount = <T,>(p: PromiseLike<T>): Promise<{ count: number | null }> =>
    Promise.resolve(p).then(
      (r: any) => ({ count: r?.count ?? 0 }),
      () => ({ count: 0 }),
    );

  const [hoyRes, semanaRes, leadsCountRes, outConnectRes] = agentIds.length > 0
    ? await Promise.all([
        safeCount(
          supabase.from('voice_calls').select('id', { count: 'exact', head: true })
            .in('agent_id', agentIds).gte('created_at', todayStart.toISOString())
        ),
        safeCount(
          supabase.from('voice_calls').select('id', { count: 'exact', head: true })
            .in('agent_id', agentIds).gte('created_at', weekAgo.toISOString())
        ),
        safeCount(
          supabase.from('leads_voice').select('id', { count: 'exact', head: true })
            .in('agent_id', agentIds).gte('created_at', weekAgo.toISOString())
        ),
        safeCount(
          supabase.from('outbound_calls').select('id', { count: 'exact', head: true })
            .in('agent_id', agentIds).eq('status', 'completed').gte('called_at', weekAgo.toISOString())
        ),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  const counters = {
    hoy:      hoyRes?.count        ?? 0,
    semana:   semanaRes?.count     ?? 0,
    leads:    leadsCountRes?.count ?? 0,
    outbound: outConnectRes?.count ?? 0,
  };

  return (
    <div id="of-llamadas" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      {/* Hero unificado en LlamadasTabs (client) — allí vive KPIs + pulse + copy dinámico */}
      <LlamadasTabs
        token={token}
        filtro={filtro}
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
        outboundHistory={(outboundHistoryRes.data ?? []) as any[]}
        outboundAgents={outboundAgents}
        callerNames={callerNames}
        agentNameById={agentNameById}
        counters={counters}
      />
    </div>
  );
}

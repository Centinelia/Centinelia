export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound }          from 'next/navigation';
import { getAgentAccess }    from '@/lib/portal/agent-access';
import CampanasClient        from './CampanasClient';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaCampanasPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('portal_token', token).single();
  if (!agent) notFound();

  const lookupEmail    = (agent as any).portal_email as string | null;
  const { data: peers } = lookupEmail
    ? await supabase.from('voice_agents')
        .select('id, agent_name, business_name, features, role')
        .eq('portal_email', lookupEmail)
    : { data: [] };
  const allPeers = peers ?? [];

  const access = await getAgentAccess(token);
  const agentIds = access?.ids ?? [agent.id as string];

  const anyHas = (key: string) => allPeers.some(a => !!((a.features as any)?.[key]));
  const showOutbound   = !!((agent as any).features?.outbound_calls) || anyHas('outbound_calls') || (agent as any).plan === 'pro';
  // BUG FIX 2026-08-09: initOutbound antes solo checkeaba el agente primario
  // (el que tiene el portal_token en la URL). Si un peer tenía outbound pero
  // el primario no, se mostraba el empty state "Ningún empleado tiene
  // activadas las llamadas salientes" aunque sí hubiera peers. Ahora checa
  // cualquier peer del equipo.
  const initOutbound   = !!((agent as any).features?.outbound_calls) || anyHas('outbound_calls');

  const outboundAgents = allPeers
    .filter(a => !!((a.features as any)?.outbound_calls))
    .map(a => ({
      id:              a.id,
      agent_name:      (a as any).agent_name ?? null,
      business_name:   a.business_name,
      features:        (a.features as any) ?? null,
      meerkat_role_id: (a as any).meerkat_role_id ?? (a.features as any)?.meerkat_role_id ?? null,
    }));

  // Fetch contacts + campaigns
  const [contactsRes, campaignsRes] = showOutbound
    ? await Promise.all([
        supabase.from('outbound_contacts')
          .select('id,nombre,telefono,email,motivo,source,status,fail_count,created_at,tags')
          .in('agent_id', agentIds).order('created_at', { ascending: false }).limit(500),
        supabase.from('outbound_campaigns')
          .select('*').in('agent_id', agentIds).order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  // ── Counters para el hero ─────────────────────────────────────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo    = new Date(Date.now() - 7 * 86400000);

  const [activasRes, todayCallsRes, weekCallsRes] = agentIds.length > 0
    ? await Promise.all([
        supabase.from('outbound_campaigns').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'active'),
        supabase.from('outbound_calls').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).gte('called_at', todayStart.toISOString())
,
        supabase.from('outbound_calls').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'completed').gte('called_at', weekAgo.toISOString())
,
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }];

  const contactosCount = (contactsRes.data ?? []).length;

  // Minutos disponibles del pool para warning en modal de campañas
  const lookupEmailForMins = (agent as any).portal_email as string | null;
  const { data: acctMins } = lookupEmailForMins
    ? await supabase.from('account_minutes')
        .select('minutes_used, minutes_included')
        .eq('portal_email', lookupEmailForMins).single()
    : { data: null };
  const minutesIncluded = (acctMins?.minutes_included ?? (agent as any).minutes_included ?? 0) as number;
  const minutesUsed     = (acctMins?.minutes_used     ?? (agent as any).minutes_used     ?? 0) as number;
  const minutesRemaining = Math.max(0, minutesIncluded - minutesUsed);

  const counters = {
    campanasActivas: activasRes?.count      ?? 0,
    contactos:       contactosCount,
    llamadasHoy:     todayCallsRes?.count   ?? 0,
    completadas:     weekCallsRes?.count    ?? 0,
  };

  return (
    <div id="of-campanas">
      <CampanasClient
        token={token}
        showOutbound={showOutbound}
        initOutbound={initOutbound}
        contacts={contactsRes.data ?? []}
        campaigns={campaignsRes.data ?? []}
        outboundAgents={outboundAgents}
        counters={counters}
        minutesRemaining={minutesRemaining}
      />
    </div>
  );
}

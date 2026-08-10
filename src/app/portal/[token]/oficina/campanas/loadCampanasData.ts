// Server-side data loader compartido entre /oficina/campanas y /oficina/encuestas.
// Ambas rutas renderizan el mismo CampanasClient (unificado con sub-tabs),
// por eso el fetch vive aquí — evita duplicar la lógica en dos page.tsx.

import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess }    from '@/lib/portal/agent-access';

const SURVEY_MEERKAT_IDS = ['nia', 'nelia', 'naia'];

export interface CampanasPageData {
  agent: {
    id:              string;
    portal_email:    string | null;
    business_name:   string;
    plan:            string;
    minutes_plan:    string;
    features:        Record<string, unknown> | null;
  };
  outbound: {
    show:             boolean;
    initialized:      boolean;
    contacts:         unknown[];
    campaigns:        unknown[];
    agents:           Array<{ id: string; agent_name: string | null; business_name: string }>;
    minutesRemaining: number;
  };
  surveys: {
    agentName?:     string;
    hasSurveyAgent: boolean;
    plan:           string;
    defaultTier:    string;
  };
  counters: {
    campanasActivas: number;
    contactos:       number;
    llamadasHoy:     number;
    completadas:     number;
  };
}

export async function loadCampanasData(token: string): Promise<CampanasPageData | null> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('*').eq('portal_token', token).single();
  if (!agent) return null;

  const lookupEmail = (agent as { portal_email?: string | null }).portal_email ?? null;
  const { data: peers } = lookupEmail
    ? await supabase.from('voice_agents')
        .select('id, agent_name, business_name, features, role')
        .eq('portal_email', lookupEmail)
    : { data: [] };
  const allPeers = peers ?? [];

  const access   = await getAgentAccess(token);
  const agentIds = access?.ids ?? [(agent as { id: string }).id];

  // ── Outbound state ─────────────────────────────────────────────────────
  const anyHas = (key: string) => allPeers.some(a => !!((a.features as Record<string, unknown> | null)?.[key]));
  const agentFeatures = (agent as { features?: Record<string, unknown> | null }).features ?? null;
  const showOutbound  = !!(agentFeatures?.outbound_calls) || anyHas('outbound_calls') || (agent as { plan?: string }).plan === 'pro';
  const initOutbound  = !!(agentFeatures?.outbound_calls);

  const outboundAgents = allPeers
    .filter(a => !!((a.features as Record<string, unknown> | null)?.outbound_calls))
    .map(a => ({
      id:              a.id as string,
      agent_name:      (a as { agent_name?: string | null }).agent_name ?? null,
      business_name:   (a as { business_name?: string }).business_name ?? '',
    }));

  const [contactsRes, campaignsRes] = showOutbound
    ? await Promise.all([
        supabase.from('outbound_contacts')
          .select('id,nombre,telefono,email,motivo,source,status,fail_count,created_at,tags')
          .in('agent_id', agentIds).order('created_at', { ascending: false }).limit(500),
        supabase.from('outbound_campaigns')
          .select('*').in('agent_id', agentIds).order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  // ── Counters para hero ─────────────────────────────────────────────────
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo    = new Date(Date.now() - 7 * 86400000);

  const [activasRes, todayCallsRes, weekCallsRes] = agentIds.length > 0
    ? await Promise.all([
        supabase.from('outbound_campaigns').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'active'),
        supabase.from('outbound_calls').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).gte('called_at', todayStart.toISOString()),
        supabase.from('outbound_calls').select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds).eq('status', 'completed').gte('called_at', weekAgo.toISOString()),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }];

  // ── Surveys state ──────────────────────────────────────────────────────
  const surveyAgentName = (agent as { agent_name?: string | null }).agent_name
    ?? (agent as { business_name?: string }).business_name
    ?? undefined;
  const hasSurveyAgent = allPeers.some(
    a => SURVEY_MEERKAT_IDS.includes(((a.features as Record<string, unknown> | null)?.meerkat_role_id as string | undefined) ?? ''),
  );

  // ── Minutos disponibles para modal de campañas ────────────────────────
  const { data: acctMins } = lookupEmail
    ? await supabase.from('account_minutes')
        .select('minutes_used, minutes_included')
        .eq('portal_email', lookupEmail).single()
    : { data: null };
  const minutesIncluded = (acctMins?.minutes_included ?? (agent as { minutes_included?: number }).minutes_included ?? 0) as number;
  const minutesUsed     = (acctMins?.minutes_used     ?? (agent as { minutes_used?: number }).minutes_used     ?? 0) as number;
  const minutesRemaining = Math.max(0, minutesIncluded - minutesUsed);

  return {
    agent: {
      id:            (agent as { id: string }).id,
      portal_email:  lookupEmail,
      business_name: (agent as { business_name?: string }).business_name ?? '',
      plan:          ((agent as { plan?: string }).plan) ?? 'pro',
      minutes_plan:  ((agent as { minutes_plan?: string }).minutes_plan) ?? 'starter',
      features:      agentFeatures,
    },
    outbound: {
      show:             showOutbound,
      initialized:      initOutbound,
      contacts:         contactsRes.data ?? [],
      campaigns:        campaignsRes.data ?? [],
      agents:           outboundAgents,
      minutesRemaining,
    },
    surveys: {
      agentName:      surveyAgentName,
      hasSurveyAgent,
      plan:           ((agent as { plan?: string }).plan) ?? 'pro',
      defaultTier:    ((agent as { minutes_plan?: string }).minutes_plan) ?? 'starter',
    },
    counters: {
      campanasActivas: activasRes?.count      ?? 0,
      contactos:       (contactsRes.data ?? []).length,
      llamadasHoy:     todayCallsRes?.count   ?? 0,
      completadas:     weekCallsRes?.count    ?? 0,
    },
  };
}

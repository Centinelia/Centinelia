export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import ClientesClient from './ClientesClient';

const PAGE_SIZE = 25; // grupos de clientes por página

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

type AgentRow = {
  id: string;
  business_name: string;
  plan: string;
  active: boolean;
  billing_status: string | null;
  minutes_used: number;
  minutes_included: number;
  portal_email: string | null;
  portal_token: string | null;
};

type ClientGroup = {
  key: string;
  client_name: string;
  client_email: string | null;
  portal_email: string | null;
  agents: AgentRow[];
};

export default async function ClientesPage({ searchParams }: Props) {
  const { page = '1', search = '' } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);

  const supabase = createAdminClient();
  const demoId   = process.env.DEMO_AGENT_ID;

  let query = supabase
    .from('voice_agents')
    .select('id, client_name, client_email, business_name, plan, active, billing_status, minutes_used, minutes_included, portal_email, portal_token')
    .neq('id', demoId ?? '')
    .order('client_name', { ascending: true });

  if (search) {
    query = query.or(
      `client_name.ilike.%${search}%,client_email.ilike.%${search}%,business_name.ilike.%${search}%`
    );
  }

  const { data: agents } = await query;

  // Agrupar por client_email (fallback: client_name) — server-side
  const map = new Map<string, ClientGroup>();
  for (const agent of agents ?? []) {
    const key = agent.client_email?.toLowerCase().trim() || agent.client_name;
    if (!map.has(key)) {
      map.set(key, {
        key,
        client_name:  agent.client_name,
        client_email: agent.client_email ?? null,
        portal_email: agent.portal_email ?? null,
        agents:       [],
      });
    }
    map.get(key)!.agents.push({
      id:               agent.id,
      business_name:    agent.business_name,
      plan:             agent.plan,
      active:           agent.active,
      billing_status:   agent.billing_status ?? null,
      minutes_used:     agent.minutes_used,
      minutes_included: agent.minutes_included,
      portal_email:     agent.portal_email ?? null,
      portal_token:     (agent as any).portal_token ?? null,
    });
  }

  const allGroups  = Array.from(map.values());
  const totalCount = allGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const groups     = allGroups.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);

  const totalAgents = (agents ?? []).length;
  const totalActive = (agents ?? []).filter(a => a.active).length;

  return (
    <ClientesClient
      clients={groups}
      totalCount={totalCount}
      totalAgents={totalAgents}
      totalActive={totalActive}
      page={pageNum}
      totalPages={totalPages}
      currentSearch={search}
    />
  );
}

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateSerial } from '@/lib/portal/serial';
import ClientesClient from './ClientesClient';

const PAGE_SIZE = 25; // grupos de clientes por página

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

type AgentRow = {
  id: string;
  agent_name: string | null;
  business_name: string;
  meerkat_role_id: string | null;
  plan: string;
  active: boolean;
  billing_status: string | null;
  portal_email: string | null;
  portal_token: string | null;
  daily_minutes_cap: number | null;
};

type ClientGroup = {
  key: string;
  client_name: string;
  client_email: string | null;
  portal_email: string | null;
  business_name: string | null;
  serial: string | null;
  agents: AgentRow[];
  acct_minutes_used: number | null;
  acct_minutes_included: number | null;
  acct_ops_used: number;
  acct_ops_limit: number;
};

export default async function ClientesPage({ searchParams }: Props) {
  const { page = '1', search = '' } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);

  const supabase = createAdminClient();
  const demoId   = process.env.DEMO_AGENT_ID;

  let query = supabase
    .from('voice_agents')
    .select('id, client_name, client_email, agent_name, business_name, plan, active, billing_status, portal_email, portal_token, daily_minutes_cap, ai_ops_used, ai_ops_limit, features')
    .neq('id', demoId ?? '')
    .order('client_name', { ascending: true });

  if (search) {
    query = query.or(
      `client_name.ilike.%${search}%,client_email.ilike.%${search}%,business_name.ilike.%${search}%`
    );
  }

  // FetchedAgent = raw SQL shape. meerkat_role_id NO viene directo del SELECT
  // (vive dentro de features JSONB), lo derivamos abajo al hacer push a group.agents.
  type FetchedAgent = Omit<AgentRow, 'meerkat_role_id'> & {
    client_name:   string;
    client_email:  string | null;
    features:      Record<string, unknown> | null;
    ai_ops_used:   number | null;
    ai_ops_limit:  number | null;
  };
  const { data: agentsRaw } = await query;
  const agents = (agentsRaw ?? []) as unknown as FetchedAgent[];

  // Agrupar por client_email (fallback: client_name) — server-side
  const map = new Map<string, ClientGroup>();
  for (const agent of agents) {
    const key = agent.client_email?.toLowerCase().trim() || agent.client_name;
    if (!map.has(key)) {
      map.set(key, {
        key,
        client_name:           agent.client_name,
        client_email:          agent.client_email ?? null,
        portal_email:          agent.portal_email ?? null,
        business_name:         agent.business_name ?? null,
        serial:                null,
        agents:                [],
        acct_minutes_used:     null,
        acct_minutes_included: null,
        acct_ops_used:         0,
        acct_ops_limit:        0,
      });
    }
    const group = map.get(key)!;
    group.acct_ops_used  += agent.ai_ops_used  ?? 0;
    group.acct_ops_limit += agent.ai_ops_limit ?? 0;
    const meerkatRoleId = ((agent.features ?? {}).meerkat_role_id as string | undefined) ?? null;
    group.agents.push({
      id:                agent.id,
      agent_name:        agent.agent_name ?? null,
      business_name:     agent.business_name,
      meerkat_role_id:   meerkatRoleId,
      plan:              agent.plan,
      active:            agent.active,
      billing_status:    agent.billing_status ?? null,
      portal_email:      agent.portal_email ?? null,
      portal_token:      agent.portal_token ?? null,
      daily_minutes_cap: agent.daily_minutes_cap ?? null,
    });
  }

  const allGroups  = Array.from(map.values());
  const totalCount = allGroups.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Fetch account-level minutes pool + serials para la página visible.
  const pageGroups    = allGroups.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);
  const emailsOnPage  = pageGroups.map(g => g.portal_email).filter((e): e is string => !!e);
  const { data: acctMinsData } = emailsOnPage.length
    ? await supabase.from('account_minutes').select('portal_email, minutes_used, minutes_included').in('portal_email', emailsOnPage)
    : { data: [] };
  const acctMinsMap = new Map((acctMinsData ?? []).map(m => [m.portal_email, m]));

  // Serial por cliente (getOrCreate, se cachea en account_serials).
  const serialByEmail = new Map<string, string>();
  await Promise.all(
    emailsOnPage.map(async email => {
      try { serialByEmail.set(email, await getOrCreateSerial(email)); } catch { /* ignore */ }
    })
  );

  const groups = pageGroups.map(g => ({
    ...g,
    acct_minutes_used:     g.portal_email ? (acctMinsMap.get(g.portal_email)?.minutes_used ?? null) : null,
    acct_minutes_included: g.portal_email ? (acctMinsMap.get(g.portal_email)?.minutes_included ?? null) : null,
    serial:                g.portal_email ? (serialByEmail.get(g.portal_email) ?? null) : null,
  }));

  const totalAgents = agents.length;
  const totalActive = agents.filter(a => a.active).length;

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

export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import type { VoiceCall } from '@/types/agent';
import LlamadasClient from './LlamadasClient';

const PAGE_SIZE = 25;

interface Props {
  searchParams: Promise<{ page?: string; agentId?: string; outcome?: string; search?: string }>;
}

export default async function LlamadasPage({ searchParams }: Props) {
  const { page = '1', agentId = '', outcome = '', search = '' } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);

  const supabase = createAdminClient();

  let query = supabase
    .from('voice_calls')
    .select('*', { count: 'exact' });

  if (agentId) query = query.eq('agent_id', agentId);
  if (outcome) query = query.eq('outcome', outcome);
  if (search)  query = query.ilike('caller_number', `%${search}%`);

  const { data: callsData, count } = await query
    .order('created_at', { ascending: false })
    .range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1);

  const { data: agentsData } = await supabase
    .from('voice_agents')
    .select('id, business_name, timezone')
    .neq('id', process.env.DEMO_AGENT_ID ?? '')
    .order('business_name');

  const calls      = (callsData ?? []) as VoiceCall[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const agents = (agentsData ?? []).map(a => ({
    id:            a.id,
    business_name: a.business_name,
    timezone:      a.timezone ?? 'America/Monterrey',
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Bitácora</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>Llamadas</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B6480' }}>
          {totalCount.toLocaleString('es-MX')} llamada{totalCount !== 1 ? 's' : ''} en total. Filtra por empleado, resultado o buscar por número.
        </p>
      </div>

      <LlamadasClient
        calls={calls}
        agents={agents}
        totalCount={totalCount}
        page={pageNum}
        totalPages={totalPages}
        currentFilters={{ agentId, outcome, search }}
      />
    </div>
  );
}

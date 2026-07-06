export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Bot, Plus } from 'lucide-react';
import AgentesClient from './AgentesClient';

const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<{
    page?:   string;
    status?: string;
    plan?:   string;
    search?: string;
    sort?:   string;
  }>;
}

export default async function AgentesPage({ searchParams }: Props) {
  const { page = '1', status = '', plan = '', search = '', sort = 'recent' } = await searchParams;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const demoId  = process.env.DEMO_AGENT_ID;
  const supabase = createAdminClient();

  let query = supabase
    .from('voice_agents')
    .select(
      'id, business_name, client_name, plan, active, billing_status, phone_number, created_at',
      { count: 'exact' }
    )
    .neq('id', demoId ?? '');

  if (status === 'activos')  query = query.eq('active', true);
  if (status === 'pausados') query = query.eq('active', false);
  if (plan === 'comercial')  query = query.eq('plan', 'comercial');
  if (plan === 'pro')        query = query.eq('plan', 'pro');
  if (search)                query = query.or(
    `business_name.ilike.%${search}%,client_name.ilike.%${search}%,phone_number.ilike.%${search}%`
  );

  const { data, count } = await query
    .order(sort === 'name' ? 'business_name' : 'created_at', { ascending: sort === 'name' })
    .range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Agentes</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
            {totalCount.toLocaleString('es-MX')} agente{totalCount !== 1 ? 's' : ''} en total
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/admin/demo"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.40)', color: '#9B6DFF' }}
          >
            <Bot size={14} />
            <span>Demo</span>
          </Link>
          <Link
            href="/admin/agentes/nuevo"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#6C3BFF', color: '#FAFBFF' }}
          >
            <Plus size={15} />
            <span className="hidden sm:inline">Nuevo agente</span>
          </Link>
        </div>
      </div>

      <AgentesClient
        agents={(data ?? []) as any[]}
        totalCount={totalCount}
        page={pageNum}
        totalPages={totalPages}
        currentFilters={{ status, plan, search, sort }}
      />
    </div>
  );
}

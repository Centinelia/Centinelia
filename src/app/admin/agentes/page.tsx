export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSerial }     from '@/lib/portal/serial';
import Link from 'next/link';
import { Bot, Plus } from 'lucide-react';
import AgentesClient from './AgentesClient';

const PAGE_SIZE = 25;

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
  const demoId             = process.env.DEMO_AGENT_ID;
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
  if (plan === 'pro')        query = query.eq('plan', 'pro');

  if (search) {
    const isSerial = /^CNT-[A-Z0-9]{5}$/i.test(search.trim());
    if (isSerial) {
      const portalEmail = await resolveSerial(search.trim());
      if (portalEmail) query = query.eq('portal_email', portalEmail);
      else             query = query.eq('id', 'no-match');
    } else {
      query = query.or(
        `business_name.ilike.%${search}%,client_name.ilike.%${search}%,phone_number.ilike.%${search}%,portal_email.ilike.%${search}%`
      );
    }
  }

  type AgentRow = { id: string; business_name: string; client_name: string; plan: string; active: boolean; billing_status: string | null; phone_number: string | null; created_at: string };
  const { data: dataRaw, count } = await query
    .order(sort === 'name' ? 'business_name' : 'created_at', { ascending: sort === 'name' })
    .range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Roster</p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Empleados
          </h1>
          <p className="text-[13px] mt-1.5" style={{ color: '#6B6480' }}>
            {totalCount.toLocaleString('es-MX')} empleado{totalCount !== 1 ? 's' : ''} en total. Meerkats client-facing (Nia, Nara, Noah, Nico, Neo, Naia, Nova) e internos (Nox, Niva, Neka, Nash).
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/admin/demo"
            className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ padding: '9px 14px', background: '#F5F0FF', color: '#6C3BFF', border: '1px solid #E8E3F5' }}
          >
            <Bot size={13} />
            <span>Demo</span>
          </Link>
          <Link
            href="/admin/demo-personalizado"
            className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ padding: '9px 14px', background: '#F5F0FF', color: '#6C3BFF', border: '1px solid #E8E3F5' }}
          >
            <Bot size={13} />
            <span>Demo personalizado</span>
          </Link>
          <Link
            href="/admin/agentes/nuevo"
            className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
            style={{
              padding:    '10px 18px',
              background: '#6C3BFF',
              color:      '#ffffff',
              boxShadow:  '0 2px 8px rgba(108,59,255,0.32)',
            }}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Nuevo empleado</span>
          </Link>
        </div>
      </div>

      <AgentesClient
        agents={(dataRaw ?? []) as AgentRow[]}
        totalCount={totalCount}
        page={pageNum}
        totalPages={totalPages}
        currentFilters={{ status, plan, search, sort }}
      />
    </div>
  );
}

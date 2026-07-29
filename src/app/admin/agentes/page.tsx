export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSerial }     from '@/lib/portal/serial';
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
  const demoId             = process.env.DEMO_AGENT_ID;
  const demoPersonalizadoId = process.env.DEMO_PERSONALIZADO_AGENT_ID;
  const supabase = createAdminClient();

  let query = supabase
    .from('voice_agents')
    .select(
      'id, business_name, client_name, plan, active, billing_status, phone_number, created_at',
      { count: 'exact' }
    )
    .neq('id', demoId ?? '');
  // NOTA: demoPersonalizadoId (Nia Monterrey en el piloto) SÍ se muestra —
  // es un agente real usado para prospectos/pilotos, no un demo genérico.

  if (status === 'activos')  query = query.eq('active', true);
  if (status === 'pausados') query = query.eq('active', false);
  if (plan === 'pro')        query = query.eq('plan', 'pro');

  if (search) {
    const isSerial = /^CNT-[A-Z0-9]{5}$/i.test(search.trim());
    if (isSerial) {
      const portalEmail = await resolveSerial(search.trim());
      if (portalEmail) query = query.eq('portal_email', portalEmail);
      else             query = query.eq('id', 'no-match'); // serial not found → empty results
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
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Empleados</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
            {totalCount.toLocaleString('es-MX')} empleado{totalCount !== 1 ? 's' : ''} en total
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
            href="/admin/demo-personalizado"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.40)', color: '#9B6DFF' }}
          >
            <Bot size={14} />
            <span>Demo personalizado</span>
          </Link>
          <Link
            href="/admin/agentes/nuevo"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: '#6C3BFF', color: '#FAFBFF' }}
          >
            <Plus size={15} />
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

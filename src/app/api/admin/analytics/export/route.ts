import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Lead',
  appointment_booked: 'Cita',
  order_taken:        'Pedido',
  transferred:        'Transferido',
  info_provided:      'Información',
  escalated_whatsapp: 'WhatsApp',
  unanswered:         'No contestó',
  other:              'Otro',
};

function esc(v: string) { return `"${v.replace(/"/g, '""')}"`; }

export async function GET(req: NextRequest) {
  // Fix U2 audit 2026-08-10: expose PII (caller_number + summaries) sin auth.
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const period = req.nextUrl.searchParams.get('period');
  const days   = period ? parseInt(period) : undefined;
  const since  = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;

  const supabase = createAdminClient();

  const baseQuery = supabase
    .from('voice_calls')
    .select('created_at, duration_seconds, outcome, caller_number, summary, agent_id, voice_agents(business_name)')
    .order('created_at', { ascending: false });

  const { data: calls } = await (since ? baseQuery.gte('created_at', since) : baseQuery);

  const headers = ['Fecha', 'Agente', 'Duración (min)', 'Resultado', 'Número', 'Resumen'];
  const rows = (calls ?? []).map((c: any) => [
    new Date(c.created_at).toLocaleString('es-MX'),
    c.voice_agents?.business_name ?? '',
    String(Math.ceil((c.duration_seconds ?? 0) / 60)),
    OUTCOME_LABELS[c.outcome] ?? c.outcome,
    c.caller_number ?? '',
    c.summary ?? '',
  ]);

  const csv      = [headers, ...rows].map(r => r.map(v => esc(String(v))).join(',')).join('\r\n');
  const filename = `llamadas-${period ?? 'todo'}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

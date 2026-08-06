import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentForPdf, pdfResponse } from '../_auth';
import { ReportePdf } from '@/lib/pdf/reporte';
import type { BrandKit } from '@/lib/brand/kit';

// ─── Branding Centinelia (el reporte lo generamos NOSOTROS para el cliente) ─
// El reporte mensual NO usa el branding del cliente porque es un producto
// que Centinelia entrega. Firma nuestra, footer con nuestros contactos.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
const SUPPORT_WA = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '+52 811 633 3559').trim();
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';

const CENTINELIA_BRAND: BrandKit = {
  businessName:   'Centinelia',
  logoUrl:        `${APP_URL}/logo-icon.png`,
  color:          '#6C3BFF',
  colorSecondary: null,
  phone:          null,
  website:        'centinelia.mx',
  address:        null,
  footerText:     `WhatsApp ${SUPPORT_WA}  ·  ${SUPPORT_EMAIL}`,
};

interface Params { params: Promise<{ token: string }> }

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  lead_created:       { label: 'Leads',        color: '#6C3BFF' },
  appointment_booked: { label: 'Citas',         color: '#3b82f6' },
  order_taken:        { label: 'Pedidos',       color: '#f59e0b' },
  transferred:        { label: 'Transferidas',  color: '#a855f7' },
  info_provided:      { label: 'Informativas',  color: '#6b7280' },
  unanswered:         { label: 'Sin respuesta', color: '#ef4444' },
  other:              { label: 'Otras',         color: '#9ca3af' },
};

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const year  = parseInt(req.nextUrl.searchParams.get('year')  ?? String(new Date().getFullYear()));
  const month = parseInt(req.nextUrl.searchParams.get('month') ?? String(new Date().getMonth() + 1));

  const ctx = await getAgentForPdf(token);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const from = new Date(year, month - 1, 1).toISOString();
  const to   = new Date(year, month, 0, 23, 59, 59).toISOString();

  const [callsRes, acctRes, agentsRes] = await Promise.all([
    supabase.from('voice_calls')
      .select('outcome, duration_seconds, created_at')
      .eq('agent_id', ctx.agent.id as string)
      .gte('created_at', from).lte('created_at', to),
    ctx.agent.portal_email
      ? supabase.from('account_minutes')
          .select('minutes_used, minutes_included')
          .eq('portal_email', ctx.agent.portal_email as string)
          .single()
      : Promise.resolve({ data: null }),
    // Suma de tareas (ai_ops_used) de todos los agentes de la cuenta
    ctx.agent.portal_email
      ? supabase.from('voice_agents')
          .select('ai_ops_used, ai_ops_limit')
          .eq('portal_email', ctx.agent.portal_email as string)
      : Promise.resolve({ data: [] }),
  ]);

  const calls = callsRes.data ?? [];
  const acct  = (acctRes as any).data;
  const agentsAgg = ((agentsRes as any).data ?? []) as { ai_ops_used?: number; ai_ops_limit?: number }[];
  const tasksUsed  = agentsAgg.reduce((s, a) => s + (a.ai_ops_used  ?? 0), 0);
  const tasksTotal = agentsAgg.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);

  // Aggregate
  const outcomeCounts: Record<string, number> = {};
  let leads = 0, appts = 0, orders = 0;
  const hourCounts: Record<number, number> = {};

  for (const c of calls) {
    outcomeCounts[c.outcome] = (outcomeCounts[c.outcome] ?? 0) + 1;
    if (c.outcome === 'lead_created')       leads++;
    if (c.outcome === 'appointment_booked') appts++;
    if (c.outcome === 'order_taken')        orders++;
    const h = new Date(c.created_at).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }

  const outcomeBreakdown = Object.entries(outcomeCounts)
    .map(([outcome, count]) => ({ outcome, count, ...(OUTCOME_META[outcome] ?? { label: outcome, color: '#9ca3af' }) }))
    .sort((a, b) => b.count - a.count);

  const topHours = Object.entries(hourCounts)
    .map(([h, count]) => ({ hour: parseInt(h), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const periodLabel = new Date(year, month - 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  const buffer = await renderToBuffer(createElement(ReportePdf, {
    brand: CENTINELIA_BRAND,   // reporte lo firma Centinelia, no el cliente
    data: {
      period:           periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1),
      clientName:       (ctx.agent.business_name as string | null) ?? undefined,
      totalCalls:       calls.length,
      leads,
      appointments:     appts,
      orders,
      minutesUsed:      acct?.minutes_used    ?? 0,
      minutesTotal:     acct?.minutes_included ?? 0,
      tasksUsed,
      tasksTotal,
      outcomeBreakdown,
      topHours,
    },
  }) as any);

  return pdfResponse(buffer, `reporte-${year}-${String(month).padStart(2, '0')}.pdf`);
}

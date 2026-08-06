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

  const [callsRes, acctRes, agentsRes, tasksRes] = await Promise.all([
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
    ctx.agent.portal_email
      ? supabase.from('voice_agents')
          .select('id, agent_name, business_name, ai_ops_used, ai_ops_limit')
          .eq('portal_email', ctx.agent.portal_email as string)
      : Promise.resolve({ data: [] }),
    ctx.agent.portal_email
      ? supabase.from('agent_tasks')
          .select('status, trigger_type, assigned_to, goal_met, current_iteration, created_at, completed_at')
          .eq('portal_email', ctx.agent.portal_email as string)
          .gte('created_at', from).lte('created_at', to)
      : Promise.resolve({ data: [] }),
  ]);

  const calls = callsRes.data ?? [];
  const acct  = (acctRes as any).data;
  const agentsAgg = ((agentsRes as any).data ?? []) as { id: string; agent_name?: string | null; business_name?: string | null; ai_ops_used?: number; ai_ops_limit?: number }[];
  const tasksUsed  = agentsAgg.reduce((s, a) => s + (a.ai_ops_used  ?? 0), 0);
  const tasksTotal = agentsAgg.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);

  // Tasks breakdown
  const tasksData = ((tasksRes as any).data ?? []) as { status: string; trigger_type: string | null; assigned_to: string | null; goal_met: boolean | null; current_iteration: number | null }[];
  const tasksInPeriod  = tasksData.length;
  const tasksCompleted = tasksData.filter(t => t.status === 'completed' && t.goal_met !== false).length;
  const tasksFailed    = tasksData.filter(t => t.status === 'failed' || t.goal_met === false).length;

  const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
    voice_call: { label: 'Desde llamada',    color: '#6C3BFF' },
    email:      { label: 'Desde correo',     color: '#3b82f6' },
    inbox:      { label: 'Desde bandeja',    color: '#3b82f6' },
    schedule:   { label: 'Programada',       color: '#a855f7' },
    scheduled:  { label: 'Programada',       color: '#a855f7' },
    manual:     { label: 'Manual',           color: '#22c55e' },
    chat:       { label: 'Desde chat',       color: '#22c55e' },
    delegation: { label: 'Delegación',       color: '#0d9488' },
    research:   { label: 'Investigación',    color: '#f59e0b' },
    document:   { label: 'Documento',        color: '#06b6d4' },
  };
  const triggerCounts: Record<string, number> = {};
  for (const t of tasksData) {
    const k = t.trigger_type ?? 'manual';
    triggerCounts[k] = (triggerCounts[k] ?? 0) + 1;
  }
  const taskTriggerBreakdown = Object.entries(triggerCounts)
    .map(([trigger, count]) => ({
      trigger,
      count,
      label: TRIGGER_LABELS[trigger]?.label ?? trigger,
      color: TRIGGER_LABELS[trigger]?.color ?? '#9ca3af',
    }))
    .sort((a, b) => b.count - a.count);

  const AGENT_COLORS = ['#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'];
  const agentNameMap: Record<string, string> = {};
  for (const a of agentsAgg) {
    agentNameMap[a.id] = (a.agent_name?.trim() || a.business_name || 'Empleado');
  }
  const agentCounts: Record<string, number> = {};
  for (const t of tasksData) {
    if (!t.assigned_to) continue;
    const name = agentNameMap[t.assigned_to] ?? 'Empleado';
    agentCounts[name] = (agentCounts[name] ?? 0) + 1;
  }
  const tasksByAgent = Object.entries(agentCounts)
    .map(([agentName, count], i) => ({ agentName, count, color: AGENT_COLORS[i % AGENT_COLORS.length] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

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
      tasksInPeriod,
      tasksCompleted,
      tasksFailed,
      taskTriggerBreakdown,
      tasksByAgent,
      outcomeBreakdown,
      topHours,
    },
  }) as any);

  return pdfResponse(buffer, `reporte-${year}-${String(month).padStart(2, '0')}.pdf`);
}

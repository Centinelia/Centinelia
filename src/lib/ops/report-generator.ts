import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { consumeAiOp } from '@/lib/ai/ops-guard';

const anthropic = new Anthropic();

export interface ReportDataSources {
  centinelia_calls?:        boolean;
  centinelia_leads?:        boolean;
  centinelia_orders?:       boolean;
  centinelia_appointments?: boolean;
  notion?:                  boolean;
}

export async function runReport(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { data: report } = await supabase
    .from('ops_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (!report || !report.active) return { ok: false, error: 'Report not found or inactive' };

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, knowledge_base, role, role_knowledge_base, notion_client_id, portal_email')
    .eq('id', report.agent_id)
    .single();

  if (!agent) return { ok: false, error: 'Agent not found' };

  // Create the run record
  const { data: run } = await supabase
    .from('ops_report_runs')
    .insert({ report_id: reportId, agent_id: agent.id, status: 'generating' })
    .select('id')
    .single();

  if (!run) return { ok: false, error: 'Failed to create run record' };

  try {
    const dataSources = report.data_sources as string[] ?? [];
    const snapshot: Record<string, unknown> = {};
    const dataBlocks: string[] = [];

    // Collect Centinelia data
    const since = getPeriodStart(report.schedule as Record<string, number>);

    if (dataSources.includes('centinelia_calls')) {
      const { data: calls } = await supabase
        .from('voice_calls')
        .select('duration_seconds, outcome, created_at')
        .eq('agent_id', agent.id)
        .gte('created_at', since.toISOString());

      const total     = calls?.length ?? 0;
      const leads     = calls?.filter(c => c.outcome === 'lead_created').length ?? 0;
      const appts     = calls?.filter(c => c.outcome === 'appointment_booked').length ?? 0;
      const orders    = calls?.filter(c => c.outcome === 'order_taken').length ?? 0;
      const totalMins = Math.round((calls?.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) ?? 0) / 60);

      snapshot.calls = { total, leads, appts, orders, totalMins };
      dataBlocks.push(`LLAMADAS (${formatPeriod(since)}):
Total: ${total}
Leads: ${leads}
Citas: ${appts}
Pedidos: ${orders}
Tiempo total: ${totalMins} min`);
    }

    if (dataSources.includes('centinelia_leads')) {
      const { data: leads } = await supabase
        .from('leads_voice')
        .select('nombre, servicio, presupuesto, created_at')
        .eq('agent_id', agent.id)
        .gte('created_at', since.toISOString());

      snapshot.leads = leads?.length ?? 0;
      if (leads?.length) {
        dataBlocks.push(`LEADS CAPTURADOS (${formatPeriod(since)}):
${leads.slice(0, 20).map(l => `- ${l.nombre ?? 'Sin nombre'}: ${l.servicio ?? 'N/A'}${l.presupuesto ? ` ($${l.presupuesto})` : ''}`).join('\n')}`);
      }
    }

    if (dataSources.includes('centinelia_orders')) {
      const { data: orders } = await supabase
        .from('orders_voice')
        .select('items, total, status, created_at')
        .eq('agent_id', agent.id)
        .gte('created_at', since.toISOString());

      snapshot.orders = orders?.length ?? 0;
      if (orders?.length) {
        const totalAmount = orders.reduce((s, o) => s + ((o.total as number) ?? 0), 0);
        dataBlocks.push(`PEDIDOS (${formatPeriod(since)}):
Total: ${orders.length}
Valor total: $${totalAmount.toLocaleString('es-MX')}`);
      }
    }

    if (dataSources.includes('centinelia_appointments')) {
      const { data: appts } = await supabase
        .from('appointments_voice')
        .select('fecha, hora, servicio, cliente_nombre, created_at')
        .eq('agent_id', agent.id)
        .gte('created_at', since.toISOString());

      snapshot.appointments = appts?.length ?? 0;
      if (appts?.length) {
        dataBlocks.push(`CITAS (${formatPeriod(since)}):
${appts.slice(0, 15).map(a => `- ${a.fecha ?? ''} ${a.hora ?? ''}: ${a.cliente_nombre ?? 'N/A'} — ${a.servicio ?? 'N/A'}`).join('\n')}`);
      }
    }

    if (dataSources.includes('notion') && agent.notion_client_id) {
      // Notion data would be fetched here if there's a notion integration
      dataBlocks.push(`[Datos de Notion no disponibles en este ciclo]`);
    }

    // Generate narrative with Anthropic
    const contextBlocks: string[] = [];
    if (agent.knowledge_base) contextBlocks.push(`NEGOCIO:\n${agent.knowledge_base}`);
    if (agent.role && agent.role_knowledge_base) contextBlocks.push(`ROL: ${agent.role}\n${agent.role_knowledge_base}`);
    const contextSection = contextBlocks.length ? `\n\n${contextBlocks.join('\n\n')}` : '';

    const customInstructions = report.report_instructions as string | null;
    const systemPrompt = `Eres un asistente de análisis de negocio. Generas reportes ejecutivos concisos y accionables en español para ${agent.business_name}.${contextSection}`;

    const userPrompt = `Genera un reporte ejecutivo con estos datos:

${dataBlocks.join('\n\n')}

${customInstructions ? `INSTRUCCIONES ADICIONALES:\n${customInstructions}\n\n` : ''}El reporte debe:
1. Comenzar con un resumen de 2-3 oraciones del período
2. Destacar los números más importantes
3. Identificar tendencias o puntos de atención
4. Terminar con 1-2 recomendaciones concretas

Sé directo, ejecutivo y sin relleno. Máximo 400 palabras.`;

    const opsResult = await consumeAiOp(agent.id as string, 1);
    if (!opsResult.ok) {
      await supabase.from('ops_report_runs').update({ status: 'error', error: 'ops_limit_reached' }).eq('id', run.id);
      return { ok: false, error: 'ops_limit_reached' };
    }

    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const narrative = msg.content[0].type === 'text' ? msg.content[0].text.trim() : 'No se pudo generar el reporte.';

    // Send report email to all recipients
    const recipients = (report.recipients as Array<{ email: string; name?: string }>) ?? [];
    const reportName = report.name as string;
    const periodLabel = `${since.toLocaleDateString('es-MX', { month: 'long', day: 'numeric' })} – ${new Date().toLocaleDateString('es-MX', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const html = reportEmailHtml({
      businessName: agent.business_name as string,
      reportName,
      periodLabel,
      narrative,
      snapshot,
    });

    const sentTo: string[] = [];
    for (const r of recipients) {
      if (r.email) {
        await sendEmail({ to: r.email, subject: `${reportName} — ${agent.business_name}`, html });
        sentTo.push(r.email);
      }
    }

    // Also send to client email
    const { data: clientAgent } = await supabase
      .from('voice_agents').select('client_email').eq('id', agent.id).single();
    if (clientAgent?.client_email && !sentTo.includes(clientAgent.client_email as string)) {
      await sendEmail({ to: clientAgent.client_email as string, subject: `${reportName} — ${agent.business_name}`, html });
      sentTo.push(clientAgent.client_email as string);
    }

    // Update run + report
    await supabase.from('ops_report_runs').update({
      data_snapshot: snapshot,
      recipients:    sentTo,
      status:        'sent',
    }).eq('id', run.id);

    await supabase.from('ops_reports').update({
      last_run_at: new Date().toISOString(),
      next_run_at: getNextRun(report.frequency as string, report.schedule as Record<string, number>).toISOString(),
    }).eq('id', reportId);

    return { ok: true };
  } catch (err) {
    console.error('[ops/report-generator] error:', err);
    await supabase.from('ops_report_runs').update({
      status: 'error',
      error:  String(err),
    }).eq('id', run.id);
    return { ok: false, error: String(err) };
  }
}

function getPeriodStart(schedule: Record<string, number>): Date {
  const now = new Date();
  if (schedule.day_of_week !== undefined) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  d.setDate(1);
  return d;
}

function getNextRun(frequency: string, schedule: Record<string, number>): Date {
  const now = new Date();
  if (frequency === 'weekly') {
    const d = new Date(now);
    const targetDay = schedule.day_of_week ?? 1; // Monday default
    const diff = (targetDay - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(schedule.hour ?? 8, 0, 0, 0);
    return d;
  }
  // monthly
  const d = new Date(now);
  d.setMonth(d.getMonth() + 1);
  d.setDate(schedule.day_of_month ?? 1);
  d.setHours(schedule.hour ?? 8, 0, 0, 0);
  return d;
}

function formatPeriod(since: Date): string {
  return `${since.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })} – hoy`;
}

function reportEmailHtml(opts: {
  businessName: string;
  reportName:   string;
  periodLabel:  string;
  narrative:    string;
  snapshot:     Record<string, unknown>;
}): string {
  const BG     = '#120726';
  const CARD   = 'rgba(255,255,255,0.055)';
  const BORDER = 'rgba(255,255,255,0.10)';
  const TEXT   = '#e2e8f0';
  const SUB    = 'rgba(255,255,255,0.58)';
  const MUTE   = 'rgba(255,255,255,0.35)';
  const ACCENT = '#9B6DFF';
  const LOGO   = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/logo-tagline.png`;

  const callsData = opts.snapshot.calls as Record<string, number> | undefined;
  const statsRows = callsData ? [
    callsData.total    && { label: 'Llamadas',  value: callsData.total,    color: ACCENT },
    callsData.leads    && { label: 'Leads',     value: callsData.leads,    color: '#A78BFA' },
    callsData.appts    && { label: 'Citas',     value: callsData.appts,    color: '#60A5FA' },
    callsData.orders   && { label: 'Pedidos',   value: callsData.orders,   color: '#FBBF24' },
    callsData.totalMins && { label: 'Minutos',  value: callsData.totalMins, color: '#34D399' },
  ].filter(Boolean) as Array<{ label: string; value: number; color: string }> : [];

  const statsTable = statsRows.length ? `
  <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:12px;padding:4px 20px;margin-bottom:16px">
    <table style="width:100%;border-collapse:collapse">
      ${statsRows.map(s => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER};vertical-align:middle">
          <span style="display:inline-block;background:${s.color}22;color:${s.color};font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;text-transform:uppercase">${s.label}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${s.color};font-size:24px;font-weight:700;text-align:right;line-height:1">${s.value}</td>
      </tr>`).join('')}
    </table>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(108,59,255,0.15)">
      <tr>
        <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;padding:20px 32px">
          <img src="${LOGO}" alt="Centinelia" width="200" style="width:200px;height:auto;display:inline-block">
        </td>
      </tr>
    </table>
    <div style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:32px">
      <div style="text-align:center;margin-bottom:20px">
        <span style="display:inline-block;background:${ACCENT}22;border:1px solid ${ACCENT}40;border-radius:20px;padding:6px 16px;color:${ACCENT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${opts.reportName}</span>
      </div>
      <h1 style="color:${TEXT};font-size:22px;font-weight:700;margin:0 0 6px;text-align:center">${opts.businessName}</h1>
      <p style="color:${SUB};font-size:13px;margin:0 0 24px;text-align:center">${opts.periodLabel}</p>
      ${statsTable}
      <div style="background:rgba(108,59,255,0.08);border:1px solid rgba(108,59,255,0.2);border-radius:12px;padding:20px;margin-bottom:16px">
        <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">Análisis ejecutivo</p>
        <p style="color:${TEXT};font-size:14px;line-height:1.75;margin:0;white-space:pre-wrap">${opts.narrative}</p>
      </div>
    </div>
    <div style="text-align:center;padding:24px 0 0">
      <p style="color:${MUTE};font-size:12px;margin:0">
        <a href="https://www.centinelia.mx" style="color:${MUTE};text-decoration:none">centinelia.mx</a>
        &nbsp;·&nbsp;
        <a href="mailto:hola@centinelia.mx" style="color:${ACCENT};text-decoration:none">hola@centinelia.mx</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

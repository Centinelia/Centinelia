import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { logLlmCall } from '@/lib/observability/llm-log';

const anthropic = new Anthropic();

export async function runReport(reportId: string): Promise<{ ok: boolean; error?: string; skipped?: boolean; reason?: string }> {
  const supabase = createAdminClient();

  const { data: report } = await supabase
    .from('ops_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (!report || !report.active) return { ok: false, error: 'Report not found or inactive' };

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, role, role_knowledge_base, portal_email')
    .eq('id', report.agent_id)
    .single();

  if (!agent) return { ok: false, error: 'Agent not found' };

  // knowledge_base vive en organizations desde commit e372013 (2026-07-20).
  // role_knowledge_base y role siguen en voice_agents (verificado 2026-08-24).
  const { data: org } = agent.portal_email
    ? await supabase
        .from('organizations')
        .select('knowledge_base')
        .eq('portal_email', agent.portal_email)
        .maybeSingle()
    : { data: null as { knowledge_base?: string | null } | null };

  // Create the run record
  const { data: run } = await supabase
    .from('ops_report_runs')
    .insert({ report_id: reportId, agent_id: agent.id, status: 'generating' })
    .select('id')
    .single();

  if (!run) return { ok: false, error: 'Failed to create run record' };

  try {
    const snapshot: Record<string, unknown> = {};
    const dataBlocks: string[] = [];
    const since = getPeriodStart(report.schedule as Record<string, number>);
    const sinceIso = since.toISOString();
    const agentIdStr = agent.id as string;

    // Todas las señales del período — en paralelo. El focus_prompt del usuario
    // decide qué destaca el reporte, no qué se jala. Antes había 4 checkboxes
    // hardcoded (calls, leads, orders, appointments) que dejaban fuera correos,
    // documentos, tareas y contratos — inútil para negocios no-call-center.
    const [callsR, leadsR, ordersR, apptsR, inboxR, docsR, tasksR, contractsR, meetingsR, outboundR] = await Promise.all([
      supabase.from('voice_calls').select('duration_seconds, outcome, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('leads_voice').select('nombre, servicio, presupuesto, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('orders_voice').select('items, total, status, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('appointments_voice').select('fecha, hora, servicio, cliente_nombre, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('ops_inbox').select('email_from, email_subject, ai_summary, category, item_type, status, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('ops_documents').select('title, filename, template_type, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('agent_tasks').select('title, status, created_at').eq('assigned_to', agentIdStr).gte('created_at', sinceIso),
      supabase.from('ops_contracts').select('id, status, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('ops_meetings').select('title, status, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
      supabase.from('outbound_emails').select('subject, created_at').eq('agent_id', agentIdStr).gte('created_at', sinceIso),
    ]);

    // LLAMADAS
    const calls = callsR.data ?? [];
    if (calls.length > 0) {
      const leads     = calls.filter(c => c.outcome === 'lead_created').length;
      const appts     = calls.filter(c => c.outcome === 'appointment_booked').length;
      const orders    = calls.filter(c => c.outcome === 'order_taken').length;
      const totalMins = Math.round(calls.reduce((s, c) => s + ((c.duration_seconds as number) ?? 0), 0) / 60);
      snapshot.calls = { total: calls.length, leads, appts, orders, totalMins };
      dataBlocks.push(`LLAMADAS (${formatPeriod(since)}):
Total: ${calls.length}
Leads: ${leads}
Citas: ${appts}
Pedidos: ${orders}
Tiempo total: ${totalMins} min`);
    }

    // LEADS
    const leadsList = leadsR.data ?? [];
    if (leadsList.length > 0) {
      snapshot.leads = leadsList.length;
      dataBlocks.push(`LEADS CAPTURADOS (${formatPeriod(since)}):
${leadsList.slice(0, 20).map(l => `- ${l.nombre ?? 'Sin nombre'}: ${l.servicio ?? 'N/A'}${l.presupuesto ? ` ($${l.presupuesto})` : ''}`).join('\n')}`);
    }

    // PEDIDOS
    const ordersList = ordersR.data ?? [];
    if (ordersList.length > 0) {
      const totalAmount = ordersList.reduce((s, o) => s + ((o.total as number) ?? 0), 0);
      snapshot.orders = ordersList.length;
      dataBlocks.push(`PEDIDOS (${formatPeriod(since)}):
Total: ${ordersList.length}
Valor total: $${totalAmount.toLocaleString('es-MX')}`);
    }

    // CITAS
    const appts = apptsR.data ?? [];
    if (appts.length > 0) {
      snapshot.appointments = appts.length;
      dataBlocks.push(`CITAS (${formatPeriod(since)}):
${appts.slice(0, 15).map(a => `- ${a.fecha ?? ''} ${a.hora ?? ''}: ${a.cliente_nombre ?? 'N/A'} — ${a.servicio ?? 'N/A'}`).join('\n')}`);
    }

    // BANDEJA (ops_inbox) — resumen por status/categoria + muestra de asuntos accionables
    const inbox = inboxR.data ?? [];
    if (inbox.length > 0) {
      const emails      = inbox.filter(i => i.item_type === 'email');
      const pending     = inbox.filter(i => i.status === 'pending' || i.status === 'info_requested');
      const escalated   = inbox.filter(i => i.status === 'escalated');
      const answered    = inbox.filter(i => i.status === 'answered' || i.status === 'auto_replied');
      const byCategory  = inbox.reduce<Record<string, number>>((acc, i) => {
        const k = (i.category as string) || 'sin_categoria';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      snapshot.inbox = { total: inbox.length, pending: pending.length, escalated: escalated.length, answered: answered.length };

      const catLine = Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      const sampleAccionables = [...pending, ...escalated]
        .slice(0, 10)
        .map(i => `- [${i.status}] ${i.email_from ?? ''}: ${i.email_subject ?? ''}${i.ai_summary ? ` — ${(i.ai_summary as string).slice(0, 140)}` : ''}`)
        .join('\n');

      dataBlocks.push(`BANDEJA (${formatPeriod(since)}):
Total recibidos: ${inbox.length} (correos: ${emails.length})
Estados: pendientes ${pending.length} · escalados ${escalated.length} · atendidos ${answered.length}
Por categoría: ${catLine || 'ninguna'}${sampleAccionables ? `\n\nMuestra accionables:\n${sampleAccionables}` : ''}`);
    }

    // CORREOS ENVIADOS
    const outbound = outboundR.data ?? [];
    if (outbound.length > 0) {
      snapshot.outbound = outbound.length;
      dataBlocks.push(`CORREOS ENVIADOS (${formatPeriod(since)}):
Total: ${outbound.length}
Muestra: ${outbound.slice(0, 8).map(o => `"${o.subject ?? '(sin asunto)'}"`).join(', ')}`);
    }

    // DOCUMENTOS
    const docs = docsR.data ?? [];
    if (docs.length > 0) {
      const byType = docs.reduce<Record<string, number>>((acc, d) => {
        const k = (d.template_type as string) || 'otro';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      snapshot.documents = docs.length;
      dataBlocks.push(`DOCUMENTOS (${formatPeriod(since)}):
Total: ${docs.length}
Por tipo: ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(', ')}
Muestra: ${docs.slice(0, 6).map(d => `"${d.title ?? d.filename ?? 'sin título'}"`).join(', ')}`);
    }

    // TAREAS
    const tasks = tasksR.data ?? [];
    if (tasks.length > 0) {
      const byStatus = tasks.reduce<Record<string, number>>((acc, t) => {
        const k = (t.status as string) || 'sin_status';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      snapshot.tasks = tasks.length;
      dataBlocks.push(`TAREAS (${formatPeriod(since)}):
Total: ${tasks.length}
Por estado: ${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}
Muestra: ${tasks.slice(0, 6).map(t => `"${t.title ?? 'sin título'}"`).join(', ')}`);
    }

    // CONTRATOS
    const contracts = contractsR.data ?? [];
    if (contracts.length > 0) {
      const byStatus = contracts.reduce<Record<string, number>>((acc, c) => {
        const k = (c.status as string) || 'sin_status';
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      snapshot.contracts = contracts.length;
      dataBlocks.push(`CONTRATOS (${formatPeriod(since)}):
Total: ${contracts.length}
Por estado: ${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }

    // JUNTAS
    const meetings = meetingsR.data ?? [];
    if (meetings.length > 0) {
      snapshot.meetings = meetings.length;
      dataBlocks.push(`JUNTAS (${formatPeriod(since)}):
Total: ${meetings.length}
Muestra: ${meetings.slice(0, 5).map(m => `"${m.title ?? 'sin título'}"`).join(', ')}`);
    }

    // Generate narrative with Anthropic
    const contextBlocks: string[] = [];
    if (org?.knowledge_base) contextBlocks.push(`NEGOCIO:\n${org.knowledge_base}`);
    if (agent.role && agent.role_knowledge_base) contextBlocks.push(`ROL: ${agent.role}\n${agent.role_knowledge_base}`);
    const contextSection = contextBlocks.length ? `\n\n${contextBlocks.join('\n\n')}` : '';

    const focusPrompt        = ((report.focus_prompt        as string | null) ?? '').trim();
    const customInstructions = ((report.report_instructions as string | null) ?? '').trim();
    const systemPrompt = `Eres un asistente de análisis de negocio. Generas reportes ejecutivos concisos y accionables en español para ${agent.business_name}.${contextSection}`;

    const userPrompt = `El usuario configuró este reporte con este enfoque:
"""
${focusPrompt || '(sin enfoque específico — genera un resumen ejecutivo del período)'}
"""

Datos disponibles del período:

${dataBlocks.length > 0 ? dataBlocks.join('\n\n') : '(sin actividad registrada en el período)'}

${customInstructions ? `INSTRUCCIONES ADICIONALES DEL USUARIO:\n${customInstructions}\n\n` : ''}El reporte debe:
1. Enfocarse en lo que el usuario pidió arriba. Si pidió algo específico y no hay datos que lo respalden, dilo con transparencia en vez de rellenar.
2. Comenzar con un resumen de 2-3 oraciones del período orientado a ese enfoque.
3. Destacar los números más relevantes al enfoque pedido.
4. Identificar tendencias o puntos de atención.
5. Terminar con 1-2 recomendaciones concretas.

Sé directo, ejecutivo y sin relleno. Máximo 400 palabras.`;

    // Probe: si el periodo no tuvo ninguna actividad de NINGUNA fuente, no
    // generar reporte ni cobrar op ni mandar correo. Marca 'skipped_empty' en
    // el run para trazabilidad. Fix 2026-08-10, ampliado 2026-08-24 con las
    // nuevas fuentes (email inbox, docs, tasks, contracts, meetings, outbound).
    if (dataBlocks.length === 0) {
      await supabase.from('ops_report_runs')
        .update({ status: 'skipped_empty', completed_at: new Date().toISOString() })
        .eq('id', run.id);
      return { ok: true, skipped: true, reason: 'empty_period' };
    }

    const opsResult = await consumeAiOp(agent.id as string, 1, { source: 'report_generator', label: 'Generación de reporte automatizado' });
    if (!opsResult.ok) {
      await supabase.from('ops_report_runs').update({ status: 'error', error: 'ops_limit_reached' }).eq('id', run.id);
      return { ok: false, error: 'ops_limit_reached' };
    }

    const __t = Date.now();
    const __m = 'claude-haiku-4-5-20251001';
    let msg;
    try {
      msg = await anthropic.messages.create({
        model:      __m,
        max_tokens: 600,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages:   [{ role: 'user', content: userPrompt }],
      });
      void logLlmCall({ source: 'report_generator', model: __m, usage: msg.usage, agentId: agent.id as string, portalEmail: (agent.portal_email as string | null) ?? null, latencyMs: Date.now() - __t, meta: { reportId } });
    } catch (err) {
      void logLlmCall({ source: 'report_generator', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id as string, portalEmail: (agent.portal_email as string | null) ?? null, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { reportId } });
      throw err;
    }

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

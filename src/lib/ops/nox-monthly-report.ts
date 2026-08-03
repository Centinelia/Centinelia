/**
 * Nox monthly report — resumen ejecutivo del mes anterior por organización.
 *
 * Corre desde /api/cron/nox-monthly-report (día 1 de cada mes). Para cada
 * organización con un coordinador (Nox/Niva) activo:
 *   1. Agrega métricas del mes previo: llamadas, tareas, documentos, correos.
 *   2. Le pide a Sonnet 4.6 (con voz de Nox) un resumen ejecutivo accionable.
 *   3. Envía un correo HTML al dueño con las métricas y el resumen.
 *
 * Idempotente: si ya se envió el reporte del mismo mes/portal, no lo repite
 * (checa nox_monthly_reports por unique constraint).
 */
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, mdToEmailHtml } from '@/lib/email/send';
import { findNoxAgent } from '@/lib/ops/nox-coordinator';

export interface MonthlyMetrics {
  calls: {
    total:              number;
    total_minutes:      number;
    avg_duration_secs:  number;
    outcomes:           Record<string, number>;
    unanswered:         number;
  };
  tasks: {
    completed:          number;
    failed:             number;
    awaiting_approval:  number;
    cancelled:          number;
    top_titles:         string[];
  };
  documents: {
    total:              number;
    by_kind:            Record<string, number>;
  };
  emails: {
    total_inbound:      number;
    auto_replied:       number;
    escalated:          number;
  };
}

async function collectMetrics(portalEmail: string, since: Date, until: Date): Promise<MonthlyMetrics> {
  const supabase = createAdminClient();
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', portalEmail);
  const agentIds = (agents ?? []).map(a => a.id as string);

  // Zero-agent org: return zeros
  if (!agentIds.length) {
    return {
      calls:     { total: 0, total_minutes: 0, avg_duration_secs: 0, outcomes: {}, unanswered: 0 },
      tasks:     { completed: 0, failed: 0, awaiting_approval: 0, cancelled: 0, top_titles: [] },
      documents: { total: 0, by_kind: {} },
      emails:    { total_inbound: 0, auto_replied: 0, escalated: 0 },
    };
  }

  const [callsR, tasksR, docsR, inboxR] = await Promise.all([
    supabase
      .from('voice_calls')
      .select('outcome, duration_seconds')
      .in('agent_id', agentIds)
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso),
    supabase
      .from('agent_tasks')
      .select('status, title')
      .eq('portal_email', portalEmail)
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso),
    supabase
      .from('ops_documents')
      .select('kind')
      .eq('portal_email', portalEmail)
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso),
    supabase
      .from('ops_inbox')
      .select('category, auto_reply_sent, escalated_at')
      .in('agent_id', agentIds)
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso),
  ]);

  const calls = callsR.data ?? [];
  const durations = calls.map(c => Number(c.duration_seconds ?? 0));
  const totalSecs = durations.reduce((s, n) => s + n, 0);
  const outcomes: Record<string, number> = {};
  let unanswered = 0;
  for (const c of calls) {
    const o = String(c.outcome ?? 'sin_clasificar');
    outcomes[o] = (outcomes[o] ?? 0) + 1;
    if (o === 'unanswered' || o === 'no_answer') unanswered++;
  }

  const tasks = tasksR.data ?? [];
  const taskBuckets = { completed: 0, failed: 0, awaiting_approval: 0, cancelled: 0 };
  for (const t of tasks) {
    if (t.status === 'completed')                 taskBuckets.completed++;
    else if (t.status === 'failed')               taskBuckets.failed++;
    else if (t.status === 'awaiting_plan_approval') taskBuckets.awaiting_approval++;
    else if (t.status === 'cancelled')            taskBuckets.cancelled++;
  }
  const topTitles = tasks
    .filter(t => t.status === 'completed')
    .slice(0, 5)
    .map(t => String(t.title ?? '').slice(0, 80));

  const docs = docsR.data ?? [];
  const byKind: Record<string, number> = {};
  for (const d of docs) {
    const k = String(d.kind ?? 'otro');
    byKind[k] = (byKind[k] ?? 0) + 1;
  }

  const inbox = inboxR.data ?? [];
  const autoReplied = inbox.filter(e => e.auto_reply_sent).length;
  const escalated   = inbox.filter(e => e.escalated_at).length;

  return {
    calls: {
      total:              calls.length,
      total_minutes:      Math.round(totalSecs / 60),
      avg_duration_secs:  calls.length ? Math.round(totalSecs / calls.length) : 0,
      outcomes,
      unanswered,
    },
    tasks: {
      completed:          taskBuckets.completed,
      failed:             taskBuckets.failed,
      awaiting_approval:  taskBuckets.awaiting_approval,
      cancelled:          taskBuckets.cancelled,
      top_titles:         topTitles,
    },
    documents: {
      total: docs.length,
      by_kind: byKind,
    },
    emails: {
      total_inbound: inbox.length,
      auto_replied:  autoReplied,
      escalated,
    },
  };
}

async function summarizeWithNox(args: {
  noxName:      string;
  businessName: string;
  monthLabel:   string;
  metrics:      MonthlyMetrics;
}): Promise<string> {
  const { noxName, businessName, monthLabel, metrics } = args;
  const prompt = `Eres ${noxName}, coordinador del equipo digital de ${businessName}. Estás escribiéndole al dueño un resumen ejecutivo del mes ${monthLabel}.

Datos del mes:
- Llamadas: ${metrics.calls.total} totales (${metrics.calls.total_minutes} minutos, promedio ${metrics.calls.avg_duration_secs}s). Sin contestar: ${metrics.calls.unanswered}. Desglose de outcomes: ${JSON.stringify(metrics.calls.outcomes)}.
- Tareas: ${metrics.tasks.completed} completadas, ${metrics.tasks.failed} fallidas, ${metrics.tasks.awaiting_approval} pendientes de aprobar, ${metrics.tasks.cancelled} canceladas.
  Ejemplos de tareas completadas: ${metrics.tasks.top_titles.map(t => `"${t}"`).join(', ') || '(ninguna)'}.
- Documentos generados: ${metrics.documents.total} (${JSON.stringify(metrics.documents.by_kind)}).
- Correos entrantes: ${metrics.emails.total_inbound} (auto-respuesta: ${metrics.emails.auto_replied}, escalados a humano: ${metrics.emails.escalated}).

Escribe en español mexicano, tono directo y profesional (como tú hablas). Máximo 250 palabras total, estructurado en 3 bloques con estos títulos exactos como h2:

## El mes en una línea
Una sola oración con la conclusión.

## Lo que sí funcionó
2-3 bullets con datos concretos.

## Lo que hay que atacar
2-3 bullets con acciones concretas (basadas en fallos, tareas pendientes, correos escalados, llamadas sin contestar).

Reglas del formato:
- El correo que va a envolver esto ya trae header con "Reporte mensual", nombre del negocio y tu firma. NO repitas esa metadata (no pongas "De:", "Para:", "Fecha:", ni un h1 con "Resumen Ejecutivo").
- Empieza directo con el primer "## El mes en una línea". Sin líneas horizontales ni frontmatter.
- Si no hubo actividad relevante en algún bloque, dilo explícitamente en vez de rellenar. No inventes datos.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = resp.content.find(b => b.type === 'text');
  return block?.type === 'text' ? block.text.trim() : '';
}

export function renderMonthlyEmailHtml(args: {
  noxName:      string;
  businessName: string;
  monthLabel:   string;
  metrics:      MonthlyMetrics;
  summary:      string;
}): string {
  const { noxName, businessName, monthLabel, metrics, summary } = args;
  // El summary viene en markdown (Sonnet lo escribe así por default). Pasamos
  // por mdToEmailHtml para que los headings/bullets/negritas se rendericen
  // con estilos inline en vez de aparecer como ## y ** literales.
  const summaryHtml = mdToEmailHtml(summary);
  return `<!doctype html><html><body style="margin:0;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <div style="margin-bottom:24px">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">${businessName}</div>
      <h1 style="margin:6px 0 0 0;font-size:22px;color:#1a0a3b">Reporte mensual — ${monthLabel}</h1>
      <div style="font-size:13px;color:#6b7280;margin-top:2px">De ${noxName}, coordinador de tu equipo</div>
    </div>
    <div style="border-top:1px solid #eef;padding-top:20px;margin-bottom:24px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:#f4f0ff;padding:12px;border-radius:8px">
          <div style="font-size:11px;color:#6c3bff;text-transform:uppercase">Llamadas</div>
          <div style="font-size:20px;color:#1a0a3b;font-weight:600">${metrics.calls.total}</div>
          <div style="font-size:12px;color:#6b7280">${metrics.calls.total_minutes} minutos</div>
        </div>
        <div style="background:#f4f0ff;padding:12px;border-radius:8px">
          <div style="font-size:11px;color:#6c3bff;text-transform:uppercase">Tareas completadas</div>
          <div style="font-size:20px;color:#1a0a3b;font-weight:600">${metrics.tasks.completed}</div>
          <div style="font-size:12px;color:#6b7280">${metrics.tasks.failed} fallidas · ${metrics.tasks.awaiting_approval} por aprobar</div>
        </div>
        <div style="background:#f4f0ff;padding:12px;border-radius:8px">
          <div style="font-size:11px;color:#6c3bff;text-transform:uppercase">Documentos</div>
          <div style="font-size:20px;color:#1a0a3b;font-weight:600">${metrics.documents.total}</div>
        </div>
        <div style="background:#f4f0ff;padding:12px;border-radius:8px">
          <div style="font-size:11px;color:#6c3bff;text-transform:uppercase">Correos</div>
          <div style="font-size:20px;color:#1a0a3b;font-weight:600">${metrics.emails.total_inbound}</div>
          <div style="font-size:12px;color:#6b7280">${metrics.emails.escalated} escalados</div>
        </div>
      </div>
    </div>
    ${summaryHtml}
    <div style="border-top:1px solid #eef;margin-top:24px;padding-top:16px;font-size:12px;color:#9ca3af">
      Este reporte lo genera ${noxName} automáticamente el día 1 de cada mes. Puedes verlo en tu portal en cualquier momento.
    </div>
  </div>
</body></html>`;
}

export interface MonthlyRunResult {
  portalsProcessed:  number;
  reportsSent:       number;
  skipped:           number;
  errors:            { portal_email: string; error: string }[];
}

export async function runNoxMonthlyReport(now = new Date()): Promise<MonthlyRunResult> {
  const supabase = createAdminClient();

  // Prior calendar month window
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0));
  const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),     1, 0, 0, 0));
  const monthLabel = monthStart.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Every portal_email with at least one active agent
  const { data: portalRows } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('active', true)
    .not('portal_email', 'is', null);
  const portalEmails = [...new Set((portalRows ?? []).map(r => r.portal_email as string))];

  const result: MonthlyRunResult = { portalsProcessed: 0, reportsSent: 0, skipped: 0, errors: [] };

  for (const portalEmail of portalEmails) {
    result.portalsProcessed++;

    try {
      // Idempotency: already sent this month/portal?
      const monthKey = monthStart.toISOString().slice(0, 7);
      const { data: existing } = await supabase
        .from('nox_monthly_reports')
        .select('id')
        .eq('portal_email', portalEmail)
        .eq('month_key', monthKey)
        .maybeSingle();
      if (existing) { result.skipped++; continue; }

      const nox = await findNoxAgent(portalEmail);
      if (!nox) { result.skipped++; continue; }

      const recipient = nox.client_email;
      if (!recipient) { result.skipped++; continue; }

      const metrics = await collectMetrics(portalEmail, monthStart, monthEnd);

      // Skip completely dead months (no activity at all) — nothing to say.
      const anyActivity = metrics.calls.total + metrics.tasks.completed + metrics.tasks.failed +
                          metrics.documents.total + metrics.emails.total_inbound;
      if (!anyActivity) { result.skipped++; continue; }

      const summary = await summarizeWithNox({
        noxName:      nox.agent_name ?? 'Nox',
        businessName: portalEmail,
        monthLabel,
        metrics,
      });

      const businessName = (await supabase
        .from('voice_agents')
        .select('business_name')
        .eq('portal_email', portalEmail)
        .not('business_name', 'is', null)
        .limit(1)
        .maybeSingle()).data?.business_name as string | null;

      await sendEmail({
        to:      recipient,
        subject: `Reporte de ${nox.agent_name ?? 'Nox'} — ${monthLabel}`,
        html:    renderMonthlyEmailHtml({
          noxName:      nox.agent_name ?? 'Nox',
          businessName: businessName ?? portalEmail,
          monthLabel,
          metrics,
          summary,
        }),
      });

      await supabase.from('nox_monthly_reports').insert({
        portal_email: portalEmail,
        month_key:    monthKey,
        metrics,
        summary,
        sent_to:      recipient,
      });

      result.reportsSent++;
    } catch (err) {
      result.errors.push({ portal_email: portalEmail, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

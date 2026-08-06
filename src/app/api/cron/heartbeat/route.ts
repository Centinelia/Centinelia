export const dynamic = 'force-dynamic';
// Frecuencia recomendada: "0 * * * *" (cada hora)
// Agregar a vercel.json cuando se active en producción:

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { sendEmail, shell, heading, infoCard, mdToEmailHtml, agentBrandedFrom } from '@/lib/email/send';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/observability/llm-log';
import { getAgentActivityWindow, renderActivityBlocks, HEARTBEAT_CAPS } from '@/lib/ai/activity-window';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

const anthropic = new Anthropic();

interface HeartbeatConfig {
  enabled:     boolean;
  frequency:   'daily' | 'weekly';
  day_of_week: number;
  hour:        number;
  task:        string;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, portal_email, timezone, heartbeat_config, heartbeat_last_run_at, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features')
    .eq('active', true)
    .not('heartbeat_config', 'is', null);

  if (!agents?.length) return NextResponse.json({ ok: true, ran: 0 });

  let ran = 0;

  for (const agent of agents) {
    const cfg = agent.heartbeat_config as HeartbeatConfig | null;
    if (!cfg?.enabled) continue;

    const tz  = agent.timezone ?? 'America/Monterrey';
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const localHour = localNow.getHours();
    const localDay  = localNow.getDay();

    if (localHour !== cfg.hour) continue;
    if (cfg.frequency === 'weekly' && localDay !== cfg.day_of_week) continue;

    // Check if already ran in this window (daily = today, weekly = this week)
    const lastRun = agent.heartbeat_last_run_at ? new Date(agent.heartbeat_last_run_at) : null;
    if (lastRun) {
      const lastLocal = new Date(lastRun.toLocaleString('en-US', { timeZone: tz }));
      if (cfg.frequency === 'daily') {
        const sameDay = lastLocal.getFullYear() === localNow.getFullYear()
          && lastLocal.getMonth() === localNow.getMonth()
          && lastLocal.getDate() === localNow.getDate();
        if (sameDay) continue;
      } else {
        const msAgo = localNow.getTime() - lastLocal.getTime();
        if (msAgo < 6 * 24 * 60 * 60 * 1000) continue;
      }
    }

    // Consume ops
    const opsResult = await consumeAiOp(agent.id, 5);
    if (!opsResult.ok) {
      await maybeSendQuotaEmail(agent, 'heartbeat');
      continue;
    }

    // Fetch multi-source activity window
    const windowMs  = cfg.frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const windowISO = new Date(now.getTime() - windowMs).toISOString();

    const vertical = (agent.features as { vertical?: string } | null)?.vertical;
    const isGobierno = vertical === 'gobierno';
    const activity = await getAgentActivityWindow(agent.id, windowISO, HEARTBEAT_CAPS, { includeCivic: isGobierno });
    const activityBlocks = renderActivityBlocks(activity, agent.timezone ?? 'America/Monterrey');

    const periodLabel = cfg.frequency === 'weekly' ? 'los últimos 7 días' : 'hoy';
    const taskLine = cfg.task?.trim()
      ? `TAREA DE CHECK-IN:\n${cfg.task.trim()}`
      : `TAREA DE CHECK-IN:\nResume la actividad y flagea lo más importante en no más de 3 puntos accionables.`;

    const prompt = `Eres ${agent.agent_name ?? agent.business_name}, empleado digital de ${agent.business_name}.

${taskLine}

ACTIVIDAD DE ${periodLabel.toUpperCase()}:

${activityBlocks}

Ejecuta la tarea usando toda la información como base. Sé conciso, directo y enfocado en resultados de negocio (leads, citas, ventas, escalaciones). Máximo 400 palabras.`;

    let result = '';
    const __t = Date.now();
    const __m = 'claude-haiku-4-5-20251001';
    try {
      const response = await anthropic.messages.create({
        model:      __m,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      });
      void logLlmCall({ source: 'heartbeat', model: __m, usage: response.usage, agentId: agent.id, portalEmail: agent.portal_email ?? null, latencyMs: Date.now() - __t });
      result = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    } catch (err) {
      void logLlmCall({ source: 'heartbeat', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: agent.id, portalEmail: agent.portal_email ?? null, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
      console.error('Heartbeat AI error:', err);
      continue;
    }

    if (!result) continue;

    // Update last run
    await supabase
      .from('voice_agents')
      .update({ heartbeat_last_run_at: now.toISOString() })
      .eq('id', agent.id);

    // Etiqueta de frecuencia reutilizada por email e insert de persistencia.
    const freqLabel = cfg.frequency === 'weekly' ? 'Semanal' : 'Diario';

    // Send via email
    if (agent.client_email) {
      const dateStr = new Date().toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
      await sendEmail({
        to:      agent.client_email,
        from:    agentBrandedFrom(agent.agent_name as string | null),
        subject: `Check-in ${freqLabel}: ${agent.agent_name ?? agent.business_name}`,
        html: shell(
          heading(`Check-in ${freqLabel}`, `${agent.agent_name ?? 'Tu empleado'} · ${dateStr}`) +
          infoCard(mdToEmailHtml(result))
        ),
      }).catch(console.error);
    }

    // Persistir check-in a heartbeat_runs solo si el agente es coordinator (Nox / Niva).
    // Fire-and-forget: no bloquea el cron ni el rate limit del siguiente agente.
    // El insert corre haya tenido o no exito el email (correo es notificacion, DB es fuente de verdad).
    const meerkatId     = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id ?? null;
    const isCoordinator = meerkatId === 'nox' || meerkatId === 'niva';

    if (isCoordinator && agent.portal_email) {
      supabase.from('heartbeat_runs').insert({
        agent_id:     agent.id,
        portal_email: agent.portal_email,
        frequency:    cfg.frequency,
        subject:      `Check-in ${freqLabel}: ${agent.agent_name ?? agent.business_name}`,
        content_md:   result,
      }).then(({ error }) => {
        if (error) console.error('[heartbeat] persist error:', error);
      });
    }

    ran++;
  }

  return NextResponse.json({ ok: true, ran });
}

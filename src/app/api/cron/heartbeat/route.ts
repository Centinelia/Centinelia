export const dynamic = 'force-dynamic';
// Frecuencia recomendada: "0 * * * *" (cada hora)
// Agregar a vercel.json cuando se active en producción:

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { sendEmail } from '@/lib/email/send';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

interface HeartbeatConfig {
  enabled:     boolean;
  frequency:   'daily' | 'weekly';
  day_of_week: number;
  hour:        number;
  task:        string;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, timezone, heartbeat_config, heartbeat_last_run_at, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features')
    .eq('active', true)
    .not('heartbeat_config', 'is', null);

  if (!agents?.length) return NextResponse.json({ ok: true, ran: 0 });

  let ran = 0;

  for (const agent of agents) {
    const cfg = agent.heartbeat_config as HeartbeatConfig | null;
    if (!cfg?.enabled || !cfg.task?.trim()) continue;

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

    // Fetch recent calls for context
    const windowMs  = cfg.frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const windowISO = new Date(now.getTime() - windowMs).toISOString();

    const { data: calls } = await supabase
      .from('voice_calls')
      .select('outcome, summary, caller_name, created_at')
      .eq('agent_id', agent.id)
      .gte('created_at', windowISO)
      .order('created_at', { ascending: false })
      .limit(50);

    const callsContext = (calls ?? []).length > 0
      ? (calls ?? []).map(c => `- [${new Date(c.created_at).toLocaleString('es-MX', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true })}] ${c.caller_name ?? 'Llamante'}: ${c.summary ?? c.outcome ?? 'sin resumen'}`).join('\n')
      : 'No hubo llamadas en este período.';

    const periodLabel = cfg.frequency === 'weekly' ? 'los últimos 7 días' : 'hoy';

    const prompt = `Eres ${agent.agent_name ?? agent.business_name}, el empleado digital de ${agent.business_name}.

TAREA DE CHECK-IN:
${cfg.task.trim()}

LLAMADAS DE ${periodLabel.toUpperCase()}:
${callsContext}

Ejecuta la tarea asignada usando la información de las llamadas como base. Sé conciso, directo y enfocado en lo accionable. Máximo 300 palabras.`;

    let result = '';
    try {
      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      });
      result = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    } catch (err) {
      console.error('Heartbeat AI error:', err);
      continue;
    }

    if (!result) continue;

    // Update last run
    await supabase
      .from('voice_agents')
      .update({ heartbeat_last_run_at: now.toISOString() })
      .eq('id', agent.id);

    // Send via email
    if (agent.client_email) {
      const freqLabel = cfg.frequency === 'weekly' ? 'Semanal' : 'Diario';
      await sendEmail({
        to:      agent.client_email,
        subject: `Check-in ${freqLabel} — ${agent.agent_name ?? agent.business_name}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;background:#120726;color:#e2e8f0">
<h2 style="color:#EDE8FF;font-size:18px;margin-bottom:8px">Check-in ${freqLabel}</h2>
<p style="color:rgba(255,255,255,0.55);font-size:13px;margin-bottom:24px">${agent.agent_name ?? 'Tu empleado'} · ${new Date().toLocaleDateString('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })}</p>
<div style="background:rgba(255,255,255,0.055);border:1px solid rgba(255,255,255,0.10);border-radius:12px;padding:20px;white-space:pre-wrap;font-size:14px;line-height:1.6">${result}</div>
</div>`,
      }).catch(console.error);
    }

    ran++;
  }

  return NextResponse.json({ ok: true, ran });
}

import { sendEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AutomationName } from '@/types/agent';

const LABELS: Record<AutomationName, string> = {
  heartbeat:       'el reporte diario',
  weekly_insights: 'las recomendaciones semanales',
  learn:           'el aprendizaje quincenal',
};

const RATE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

interface AgentSubset {
  id:                 string;
  client_email:       string | null;
  agent_name:         string | null;
  business_name:      string | null;
  ai_ops_used:        number;
  ai_ops_limit:       number;
  minutes_reset_date: string | null;
  portal_token:       string | null;
  features:           any;
}

export async function maybeSendQuotaEmail(agent: AgentSubset, automation: AutomationName): Promise<{ sent: boolean }> {
  if (!agent.client_email) return { sent: false };
  const last = agent.features?.automations?.[automation]?.last_quota_email_sent_at as string | undefined;
  if (last) {
    const age = Date.now() - new Date(last).getTime();
    if (age < RATE_LIMIT_MS) return { sent: false };
  }

  const label = LABELS[automation];
  const resetDate = agent.minutes_reset_date ?? '';
  const portalUrl = agent.portal_token
    ? `https://www.centinelia.mx/portal/${agent.portal_token}/cuenta`
    : 'https://www.centinelia.mx';

  const C = {
    bg:     '#120726',
    card:   'rgba(255,255,255,0.055)',
    border: 'rgba(255,255,255,0.10)',
    accent: '#9B6DFF',
    text:   '#e2e8f0',
    sub:    'rgba(255,255,255,0.58)',
    mute:   'rgba(255,255,255,0.35)',
  };

  await sendEmail({
    to:      agent.client_email,
    subject: `Tu empleado necesita más tareas`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;background:${C.bg};color:${C.text}">
<h2 style="color:#EDE8FF;font-size:18px;margin:0 0 8px">Tu empleado necesita más tareas</h2>
<p style="color:${C.sub};font-size:13px;margin:0 0 24px">${agent.agent_name ?? 'Tu empleado'} · ${new Date().toLocaleDateString('es-MX', { month: 'long', day: 'numeric' })}</p>
<div style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:20px;margin-bottom:24px;line-height:1.6">
<p style="margin:0 0 16px">Hola,</p>
<p style="margin:0 0 16px">${agent.agent_name ?? 'Tu empleado'} intentó ejecutar ${label} pero se acabó tu pool mensual de tareas (${agent.ai_ops_used}/${agent.ai_ops_limit}).</p>
<p style="margin:0 0 16px">El feature se pausa automáticamente hasta que:</p>
<ul style="margin:0 0 16px;padding-left:20px">
<li style="margin:0 0 8px">El pool se resetee el ${resetDate}, o</li>
<li>Compres un paquete extra de tareas</li>
</ul>
<p style="margin:0 0 24px;text-align:center">
<a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px">Comprar tareas extras</a>
</p>
<p style="margin:0 0 12px;font-size:13px">Si crees que esto es un error, respóndenos a hola@centinelia.mx.</p>
<p style="margin:0;font-size:13px">Centinelia</p>
</div>
</div>`,
  });

  const supabase = createAdminClient();
  const nextFeatures = {
    ...(agent.features ?? {}),
    automations: {
      ...((agent.features?.automations ?? {}) as object),
      [automation]: {
        ...((agent.features?.automations?.[automation] ?? {}) as object),
        last_quota_email_sent_at: new Date().toISOString(),
      },
    },
  };
  await supabase.from('voice_agents').update({ features: nextFeatures }).eq('id', agent.id);

  return { sent: true };
}

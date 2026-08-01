import { sendEmail, shell, heading, infoCard, btn } from '@/lib/email/send';
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
  features:           Record<string, unknown> | null;
}

export async function maybeSendQuotaEmail(agent: AgentSubset, automation: AutomationName): Promise<{ sent: boolean }> {
  if (!agent.client_email) return { sent: false };
  const automations = (agent.features?.automations ?? {}) as Record<string, { last_quota_email_sent_at?: string } | undefined>;
  const last = automations[automation]?.last_quota_email_sent_at;
  if (last) {
    const age = Date.now() - new Date(last).getTime();
    if (age < RATE_LIMIT_MS) return { sent: false };
  }

  const label = LABELS[automation];
  const resetSentence = agent.minutes_reset_date
    ? `El pool se resetee el ${new Date(agent.minutes_reset_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}, o`
    : `El pool se resetee en el próximo ciclo, o`;
  const portalUrl = agent.portal_token
    ? `https://www.centinelia.mx/portal/${agent.portal_token}?tab=cuenta#comprar`
    : 'https://www.centinelia.mx';
  const dateStr = new Date().toLocaleDateString('es-MX', { month: 'long', day: 'numeric' });

  const agentLabel = agent.agent_name?.trim() || agent.business_name?.trim() || 'Tu empleado';
  await sendEmail({
    to:      agent.client_email,
    subject: `${agentLabel} necesita más tareas para ${label}`,
    html: shell(
      heading('Tu empleado necesita más tareas', `${agent.agent_name ?? 'Tu empleado'} · ${dateStr}`) +
      infoCard(`
        <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 12px">Hola,</p>
        <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 12px">${agent.agent_name ?? 'Tu empleado'} intentó ejecutar ${label} pero se acabó tu pool mensual de tareas (${agent.ai_ops_used}/${agent.ai_ops_limit}).</p>
        <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 8px">El feature se pausa automáticamente hasta que:</p>
        <ul style="margin:0 0 8px;padding-left:20px;color:#F1EEFF;font-size:14px;line-height:1.7">
          <li style="margin:0 0 6px">${resetSentence}</li>
          <li>Compres un paquete extra de tareas</li>
        </ul>
      `) +
      btn('Comprar tareas extras', portalUrl) +
      `<p style="color:#C8BEE8;font-size:12px;margin:20px 0 0;text-align:center">Si crees que esto es un error, respóndenos a hola@centinelia.mx.</p>`
    ),
  });

  const supabase = createAdminClient();

  // Re-SELECT fresh features to avoid clobbering concurrent PATCH toggles
  const { data: freshAgent } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('id', agent.id)
    .single();
  const currentFeatures = (freshAgent?.features ?? agent.features ?? {}) as Record<string, unknown>;
  const currentAuto     = (currentFeatures.automations ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const currentEntry    = (currentAuto[automation] ?? {}) as Record<string, unknown>;

  const nextFeatures = {
    ...currentFeatures,
    automations: {
      ...currentAuto,
      [automation]: {
        ...currentEntry,
        last_quota_email_sent_at: new Date().toISOString(),
      },
    },
  };
  await supabase.from('voice_agents').update({ features: nextFeatures }).eq('id', agent.id);

  return { sent: true };
}

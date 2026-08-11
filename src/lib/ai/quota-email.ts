import { sendEmail, shell, heading, infoCard, btn } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrgToken } from '@/lib/portal/org-token';
import type { AutomationName } from '@/types/agent';

const LABELS: Record<AutomationName, string> = {
  heartbeat:       'el reporte diario',
  weekly_insights: 'las recomendaciones semanales',
  learn:           'el aprendizaje quincenal',
  brief_del_dia:   'el brief del día',
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
  portal_email?:      string | null;
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
  // Typo fix: "resetee" no es palabra; usar "renueva". Además el date parse
  // con `T00:00:00` evita off-by-one por tz México vs UTC del server.
  const resetSentence = agent.minutes_reset_date
    ? `El pool se renueva el ${new Date(agent.minutes_reset_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}, o`
    : `El pool se renueva en el próximo ciclo, o`;
  const supabase = createAdminClient();
  const orgToken = agent.portal_email ? await getOrgToken(agent.portal_email, supabase) : null;
  const tokenForUrl = orgToken ?? agent.portal_token;
  const portalUrl = tokenForUrl
    ? `https://www.centinelia.mx/portal/${tokenForUrl}?tab=cuenta#comprar`
    : 'https://www.centinelia.mx';
  const dateStr = new Date().toLocaleDateString('es-MX', { month: 'long', day: 'numeric' });

  // Pool org-level: preferir account_ops / organizations sobre per-agent counters
  // que quedan stale post-ledger flip. Ver [[feedback-audit-read-path-fidelity]].
  let poolUsed  = agent.ai_ops_used;
  let poolLimit = agent.ai_ops_limit;
  if (agent.portal_email) {
    const [orgRes, acctOpsRes] = await Promise.all([
      supabase.from('organizations')
        .select('monthly_ops_pool, monthly_ops_used, ops_ledger_enabled')
        .eq('portal_email', agent.portal_email).maybeSingle(),
      supabase.from('account_ops')
        .select('ops_used, ops_included')
        .eq('portal_email', agent.portal_email).maybeSingle(),
    ]);
    const org     = orgRes.data as { monthly_ops_pool?: number | null; monthly_ops_used?: number | null; ops_ledger_enabled?: boolean | null } | null;
    const acctOps = acctOpsRes.data as { ops_used?: number | null; ops_included?: number | null } | null;
    const ledgerEnabled = !!org?.ops_ledger_enabled;
    const orgPoolTotal  = (org?.monthly_ops_pool as number | null) ?? null;
    const orgPoolUsed   = (org?.monthly_ops_used as number | null) ?? null;
    if (orgPoolTotal != null) poolLimit = orgPoolTotal;
    else if (typeof acctOps?.ops_included === 'number' && acctOps.ops_included > 0) poolLimit = acctOps.ops_included;
    if (ledgerEnabled && typeof acctOps?.ops_used === 'number') poolUsed = acctOps.ops_used;
    else if (orgPoolTotal != null) poolUsed = orgPoolUsed ?? 0;
  }

  const agentLabel = agent.agent_name?.trim() || agent.business_name?.trim() || 'Tu empleado';
  await sendEmail({
    to:      agent.client_email,
    subject: `${agentLabel} necesita más tareas para ${label}`,
    html: shell(
      heading('Tu empleado necesita más tareas', `${agent.agent_name ?? 'Tu empleado'} · ${dateStr}`) +
      infoCard(`
        <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 12px">Hola,</p>
        <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 12px">${agent.agent_name ?? 'Tu empleado'} intentó ejecutar ${label} pero se acabó tu pool mensual de tareas (${poolUsed}/${poolLimit}).</p>
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

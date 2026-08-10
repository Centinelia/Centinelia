// Digest diario de correos marcados spam que podrían ser false positives.
// Filtra por señales de "sospechoso" (body > 500 chars = probablemente lead real
// con contenido sustancial, no promocional). Envía por agente al approval_email
// o client_email con link al tab Spam del portal.
//
// Reusa la columna digest_sent_at de ops_inbox (misma que auto-mode-digest).
// Schedule: 15 UTC = 9am Monterrey.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, badge, heading, infoCard, btn } from '@/lib/email/send';
import { resolveMeerkatFromAgent } from '@/lib/email/meerkat-identity';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { getOrgToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SuspiciousSpam {
  id:            string;
  agent_id:      string;
  email_subject: string;
  email_from:    string;
  ai_summary:    string | null;
  body_length:   number;
}

interface AgentInfo {
  id:             string;
  agent_name:     string;
  business_name:  string;
  portal_token:   string;
  portal_email:   string | null;
  client_email:   string | null;
  approval_email: string | null;
  features:       Record<string, unknown> | null;
  /** Populated post-fetch: canonical org token (falls back a portal_token legacy). */
  url_token?:     string | null;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
const MIN_BODY_LENGTH = 500;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Correos marcados spam en últimas 24h sin digest todavía
  const { data: items, error: itemsErr } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_subject, email_from, ai_summary, email_body')
    .eq('category', 'spam')
    .eq('status', 'skipped')
    .is('digest_sent_at', null)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true });

  if (itemsErr) {
    console.error('[spam-review-digest] items query failed:', itemsErr);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ agents_notified: 0, emails_sent: 0, suspicious: 0 });
  }

  // 2. Filtrar por sospechosos (body largo = probable lead real)
  const suspicious: SuspiciousSpam[] = [];
  for (const it of items) {
    const bodyLen = ((it.email_body as string) ?? '').length;
    if (bodyLen < MIN_BODY_LENGTH) continue;
    suspicious.push({
      id:            it.id as string,
      agent_id:      it.agent_id as string,
      email_subject: (it.email_subject as string) ?? '',
      email_from:    (it.email_from as string) ?? '',
      ai_summary:    (it.ai_summary as string | null) ?? null,
      body_length:   bodyLen,
    });
  }

  if (suspicious.length === 0) {
    // Marcar todos los revisados como digest_sent para no re-considerarlos
    const allIds = items.map(i => i.id as string);
    await supabase.from('ops_inbox').update({ digest_sent_at: new Date().toISOString() }).in('id', allIds);
    return NextResponse.json({ agents_notified: 0, emails_sent: 0, suspicious: 0, marked: allIds.length });
  }

  // 3. Agrupar por agent_id
  const byAgent = new Map<string, SuspiciousSpam[]>();
  for (const it of suspicious) {
    const list = byAgent.get(it.agent_id) ?? [];
    list.push(it);
    byAgent.set(it.agent_id, list);
  }

  // 4. Resolver info de agentes
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_token, portal_email, client_email, approval_email, features')
    .in('id', Array.from(byAgent.keys()));

  // Resolver org_token canónico por portalEmail (cachea para evitar N queries).
  const orgTokenCache = new Map<string, string | null>();
  const resolvedAgents: AgentInfo[] = [];
  for (const a of agents ?? []) {
    const info = { ...(a as unknown as AgentInfo) };
    if (info.portal_email) {
      if (!orgTokenCache.has(info.portal_email)) {
        orgTokenCache.set(info.portal_email, await getOrgToken(info.portal_email, supabase));
      }
      info.url_token = orgTokenCache.get(info.portal_email) ?? info.portal_token;
    } else {
      info.url_token = info.portal_token;
    }
    resolvedAgents.push(info);
  }

  const agentMap = new Map<string, AgentInfo>(
    resolvedAgents.map(a => [a.id, a]),
  );

  // 5. Enviar digest por agente
  let emailsSent = 0;
  const successIds: string[] = [];

  for (const [agentId, agentItems] of byAgent) {
    const agent = agentMap.get(agentId);
    if (!agent) continue;

    const notifyTo = agent.approval_email || agent.client_email;
    if (!notifyTo) {
      console.warn(`[spam-review-digest] agent ${agentId} sin destinatario, skip`);
      continue;
    }

    const html = digestHtml({
      agent,
      items: agentItems,
    });

    try {
      const sent = await sendEmail({
        to:      notifyTo,
        subject: `${agent.agent_name}: revisa ${agentItems.length} correo${agentItems.length === 1 ? '' : 's'} marcado${agentItems.length === 1 ? '' : 's'} spam por si acaso`,
        html,
      });
      if (sent) {
        emailsSent++;
        successIds.push(...agentItems.map(i => i.id));
      }
    } catch (err) {
      console.error(`[spam-review-digest] send failed for agent ${agentId}:`, err);
    }
  }

  // 6. Marcar todos los items revisados (sospechosos + no sospechosos) como digest_sent
  const allIds = items.map(i => i.id as string);
  await supabase.from('ops_inbox').update({ digest_sent_at: new Date().toISOString() }).in('id', allIds);

  return NextResponse.json({
    agents_notified: byAgent.size,
    emails_sent:     emailsSent,
    suspicious:      suspicious.length,
    total_reviewed:  items.length,
  });
}

function digestHtml(args: {
  agent: AgentInfo;
  items: SuspiciousSpam[];
}): string {
  const meerkat = resolveMeerkatFromAgent({
    agent_name:    args.agent.agent_name,
    business_name: args.agent.business_name,
    features:      args.agent.features,
  });
  const portalUrl = `${BASE_URL}/portal/${args.agent.url_token ?? args.agent.portal_token}/oficina/bandeja?tab=spam`;
  const n = args.items.length;

  const itemsHtml = args.items.map(it => infoCard(`
    <p style="color:#F1EEFF;font-size:14px;font-weight:600;margin:0 0 4px;line-height:1.35">${escapeHtml(it.email_subject || '(sin asunto)')}</p>
    <p style="color:#8C7FB8;font-size:12px;margin:0 0 8px">De: ${escapeHtml(it.email_from)}</p>
    ${it.ai_summary ? `<p style="color:#C8BEE8;font-size:13px;line-height:1.6;margin:0">${escapeHtml(it.ai_summary)}</p>` : ''}
  `)).join('');

  return shell(
    `${badge('Revisar por si acaso', meerkat.color)}
    ${heading(`${n} correo${n === 1 ? '' : 's'} sospechoso${n === 1 ? '' : 's'}`, args.agent.business_name)}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px;text-align:center">
      Marqué estos como spam pero podrían ser leads reales o correos legítimos. Rescátalos desde la bandeja si me equivoqué.
    </p>
    ${itemsHtml}
    ${btn('Ver bandeja de spam →', portalUrl, { color: meerkat.color })}
    <p style="color:#8C7FB8;font-size:11px;line-height:1.5;margin:20px 0 0;text-align:center">
      Filtro: solo correos con más de ${MIN_BODY_LENGTH} caracteres. Los promocionales cortos ya se descartaron.
    </p>`,
    { meerkat, preheader: `${n} correos marcados spam para revisión` },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

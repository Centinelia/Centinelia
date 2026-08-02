import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, badge, heading, infoCard, btn } from '@/lib/email/send';
import { resolveMeerkatFromAgent } from '@/lib/email/meerkat-identity';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface InboxItem {
  id:              string;
  agent_id:        string;
  email_subject:   string;
  email_from:      string;
  ai_summary:      string | null;
  auto_mode_reason: string | null;
}

interface AgentInfo {
  id:              string;
  agent_name:      string;
  business_name:   string;
  portal_token:    string;
  client_email:    string | null;
  approval_email:  string | null;
  features:        Record<string, unknown> | null;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Items auto-enviados en las últimas 24h sin digest todavía
  const { data: items, error: itemsErr } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_subject, email_from, ai_summary, auto_mode_reason')
    .eq('auto_mode_decision', 'send')
    .eq('status', 'auto_replied')
    .is('digest_sent_at', null)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true });

  if (itemsErr) {
    console.error('[auto-mode-digest] items query failed:', itemsErr);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ agents_notified: 0, emails_sent: 0 });
  }

  // 2. Agrupar por agent_id
  const byAgent = new Map<string, InboxItem[]>();
  for (const it of items as InboxItem[]) {
    const list = byAgent.get(it.agent_id) ?? [];
    list.push(it);
    byAgent.set(it.agent_id, list);
  }

  // 3. Resolver info de agentes en un solo query
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_token, client_email, approval_email, features')
    .in('id', Array.from(byAgent.keys()));

  const agentMap = new Map<string, AgentInfo>(
    (agents ?? []).map(a => [a.id, a as AgentInfo]),
  );

  // 4. Enviar digest por agente
  let emailsSent = 0;
  const successIds: string[] = [];

  for (const [agentId, agentItems] of byAgent) {
    const agent = agentMap.get(agentId);
    if (!agent) continue;

    const notifyTo = agent.approval_email || agent.client_email;
    if (!notifyTo) {
      console.warn(`[auto-mode-digest] agent ${agentId} sin destinatario, skip`);
      continue;
    }

    const html = digestHtml({
      agent,
      items: agentItems,
    });

    try {
      const sent = await sendEmail({
        to:      notifyTo,
        subject: `${agent.agent_name} respondió ${agentItems.length} correo${agentItems.length === 1 ? '' : 's'} sin necesitar tu OK`,
        html,
      });
      if (sent) {
        emailsSent++;
        successIds.push(...agentItems.map(i => i.id));
      }
    } catch (err) {
      console.error(`[auto-mode-digest] send failed for agent ${agentId}:`, err);
    }
  }

  // 5. Marcar digest_sent_at solo para los enviados
  if (successIds.length > 0) {
    await supabase
      .from('ops_inbox')
      .update({ digest_sent_at: new Date().toISOString() })
      .in('id', successIds);
  }

  return NextResponse.json({ agents_notified: byAgent.size, emails_sent: emailsSent });
}

function digestHtml(args: {
  agent: AgentInfo;
  items: InboxItem[];
}): string {
  const meerkat = resolveMeerkatFromAgent({
    agent_name:    args.agent.agent_name,
    business_name: args.agent.business_name,
    features:      args.agent.features,
  });
  const portalUrl = `${BASE_URL}/portal/${args.agent.portal_token}/oficina/bandeja?tab=auto`;
  const n = args.items.length;

  const itemsHtml = args.items.map(it => infoCard(`
    <p style="color:#F1EEFF;font-size:14px;font-weight:600;margin:0 0 4px;line-height:1.35">${escapeHtml(it.email_subject || '(sin asunto)')}</p>
    <p style="color:#8C7FB8;font-size:12px;margin:0 0 8px">De: ${escapeHtml(it.email_from)}</p>
    ${it.ai_summary ? `<p style="color:#C8BEE8;font-size:13px;line-height:1.6;margin:0">${escapeHtml(it.ai_summary)}</p>` : ''}
  `)).join('');

  return shell(
    `${badge('Modo auto', meerkat.color)}
    ${heading(`Respondí ${n} correo${n === 1 ? '' : 's'}`, args.agent.business_name)}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 20px;text-align:center">
      Estos correos se enviaron sin necesitar tu aprobación. Si alguno no debió enviarse, márcalo desde el portal.
    </p>
    ${itemsHtml}
    ${btn('Ver correos auto-enviados →', portalUrl, { color: meerkat.color })}
    <p style="color:#8C7FB8;font-size:11px;line-height:1.5;margin:20px 0 0;text-align:center">
      Cambia el modo del empleado en Portal → Correo.
    </p>`,
    { meerkat, preheader: `${meerkat.name} respondió ${n} correos` },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

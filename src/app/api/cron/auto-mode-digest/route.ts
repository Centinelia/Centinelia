import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

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
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
    .select('id, agent_name, business_name, portal_token, client_email, approval_email')
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
      agentName:    agent.agent_name,
      businessName: agent.business_name,
      portalToken:  agent.portal_token,
      items:        agentItems,
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
  agentName:    string;
  businessName: string;
  portalToken:  string;
  items:        InboxItem[];
}): string {
  const portalUrl = `${BASE_URL}/portal/${args.portalToken}/oficina/bandeja`;

  const itemsHtml = args.items.map(it => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid rgba(26,10,59,0.08)">
        <div style="color:#1A0A3B;font-size:14px;font-weight:600;margin-bottom:4px">${escapeHtml(it.email_subject || '(sin asunto)')}</div>
        <div style="color:rgba(26,10,59,0.6);font-size:12px;margin-bottom:6px">De: ${escapeHtml(it.email_from)}</div>
        ${it.ai_summary ? `<div style="color:rgba(26,10,59,0.7);font-size:13px;line-height:1.5">${escapeHtml(it.ai_summary)}</div>` : ''}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:28px">
      <h1 style="color:#1A0A3B;font-size:20px;font-weight:700;margin:0 0 8px">${escapeHtml(args.agentName)} respondió ${args.items.length} correo${args.items.length === 1 ? '' : 's'}</h1>
      <p style="color:rgba(26,10,59,0.6);font-size:14px;margin:0 0 20px">Estos correos se enviaron sin necesitar tu aprobación (modo Auto). Si alguno no debió enviarse, entra al portal y márcalo.</p>
      <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
      <div style="text-align:center;margin-top:24px">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Ver bandeja completa</a>
      </div>
      <p style="color:rgba(26,10,59,0.4);font-size:11px;line-height:1.5;margin:20px 0 0;text-align:center">Cambia el modo del empleado en Portal → Correo</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

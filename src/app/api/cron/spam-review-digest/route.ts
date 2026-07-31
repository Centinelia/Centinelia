// Digest diario de correos marcados spam que podrían ser false positives.
// Filtra por señales de "sospechoso" (body > 500 chars = probablemente lead real
// con contenido sustancial, no promocional). Envía por agente al approval_email
// o client_email con link al tab Spam del portal.
//
// Reusa la columna digest_sent_at de ops_inbox (misma que auto-mode-digest).
// Schedule: 15 UTC = 9am Monterrey.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

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
  client_email:   string | null;
  approval_email: string | null;
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
    .select('id, agent_name, business_name, portal_token, client_email, approval_email')
    .in('id', Array.from(byAgent.keys()));

  const agentMap = new Map<string, AgentInfo>(
    (agents ?? []).map(a => [a.id as string, a as unknown as AgentInfo]),
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
      agentName:    agent.agent_name,
      businessName: agent.business_name,
      portalToken:  agent.portal_token,
      items:        agentItems,
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
  agentName:    string;
  businessName: string;
  portalToken:  string;
  items:        SuspiciousSpam[];
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
      <h1 style="color:#1A0A3B;font-size:20px;font-weight:700;margin:0 0 8px">Correos marcados spam para revisión</h1>
      <p style="color:rgba(26,10,59,0.6);font-size:14px;margin:0 0 20px">
        ${escapeHtml(args.agentName)} marcó estos ${args.items.length} correo${args.items.length === 1 ? '' : 's'} como spam en las últimas 24 horas, pero tienen contenido sustancial que sugiere podrían ser leads reales o correos legítimos. Revisa si alguno era real y en ese caso rescátalo desde el portal.
      </p>
      <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
      <div style="text-align:center;margin-top:24px">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Ver tab Spam en la bandeja</a>
      </div>
      <p style="color:rgba(26,10,59,0.4);font-size:11px;line-height:1.5;margin:20px 0 0;text-align:center">Filtro aplicado: correos con cuerpo mayor a ${MIN_BODY_LENGTH} caracteres. Los promocionales cortos ya se descartaron.</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

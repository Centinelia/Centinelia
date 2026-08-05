import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { transitionInboxItem } from '@/lib/state-machines/inbox-item';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_from, email_subject, ai_draft, item_type, status')
    .eq('approval_token', token)
    .single();

  if (!item) return htmlPage('Error', 'Token inválido o expirado.', '#ef4444');
  if (item.status !== 'pending') return htmlPage(
    'Ya procesado',
    `Este elemento ya fue ${item.status === 'approved' ? 'aprobado' : 'rechazado'}.`,
    item.status === 'approved' ? '#22c55e' : '#f59e0b',
  );

  // Get agent info for sending the response
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, client_email, portal_token, agent_name')
    .eq('id', item.agent_id)
    .single();

  // Send the draft response if it's an email type and we have a draft
  if (item.item_type === 'email' && item.ai_draft && item.email_from) {
    const agentName    = agent?.agent_name ?? 'Centinelia';
    const businessName = agent?.business_name ?? 'Negocio';

    await sendEmail({
      to:      item.email_from,
      subject: `Re: ${item.email_subject || ''}`.trim(),
      html:    simpleResponseHtml(businessName, agentName, item.ai_draft),
    });
  }

  // Mark as approved + sent (via state machine)
  await transitionInboxItem({
    supabase,
    inboxId:  item.id,
    toStatus: 'approved',
    actor:    'user',
    reason:   'user_approved_via_magic_link',
    metadata: { item_type: item.item_type, sent_to: item.email_from },
    extraFields: {
      sent_at:    new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  const portalUrl = agent?.portal_token ? `${BASE_URL}/portal/${agent.portal_token}?tab=oficina` : BASE_URL;

  return htmlPage(
    item.item_type === 'invoice' ? 'Factura aprobada' : 'Respuesta enviada',
    item.item_type === 'invoice'
      ? 'La factura fue aprobada y registrada correctamente.'
      : `La respuesta fue enviada a ${item.email_from}.`,
    '#22c55e',
    portalUrl,
  );
}

function simpleResponseHtml(businessName: string, agentName: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F7FF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:28px">
      <p style="color:#1A0A3B;font-size:14px;line-height:1.7;margin:0 0 24px;white-space:pre-wrap">${body}</p>
      <p style="color:rgba(26,10,59,0.4);font-size:12px;margin:0">— ${agentName}, ${businessName}</p>
    </div>
  </div>
</body>
</html>`;
}

function htmlPage(title: string, message: string, color: string, backUrl?: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Centinelia</title>
</head>
<body style="margin:0;padding:0;background:#120726;font-family:Arial,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center">
  <div style="text-align:center;padding:48px 24px;max-width:360px">
    <div style="width:56px;height:56px;border-radius:50%;background:${color}22;border:2px solid ${color}40;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:24px">
      ${color === '#22c55e' ? '✓' : '✕'}
    </div>
    <h1 style="color:#e2e8f0;font-size:20px;font-weight:700;margin:0 0 10px">${title}</h1>
    <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;margin:0 0 28px">${message}</p>
    ${backUrl ? `<a href="${backUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Ver en el portal</a>` : ''}
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

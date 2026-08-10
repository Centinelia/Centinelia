import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { transitionInboxItem } from '@/lib/state-machines/inbox-item';
import { recordHumanDecision } from '@/lib/human-gates/record';
import { getConnector } from '@/lib/connectors';
import { getOrgToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from('ops_inbox')
    .select('id, agent_id, email_from, email_subject, ai_draft, item_type, status, raw_message_id, thread_id')
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
    .select('business_name, client_email, portal_token, agent_name, portal_email')
    .eq('id', item.agent_id)
    .single();

  // Send the draft response if it's an email type and we have a draft
  if (item.item_type === 'email' && item.ai_draft && item.email_from) {
    const agentName    = agent?.agent_name ?? 'Centinelia';
    const businessName = agent?.business_name ?? 'Negocio';

    // Resolver connector: per-agent primero (identidad del empleado), per-org
    // fallback. Sin esta prioridad, empleados con su propio correo (ej. Noah
    // con verdantismx@gmail.com) veían sus respuestas salir desde el correo
    // organizacional (nazre20@gmail.com) — remitente ajeno al hilo del cliente.
    type IntegrationRow = Parameters<typeof getConnector>[0];
    let integration: IntegrationRow | null = null;

    const { data: perAgent } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('agent_id', item.agent_id)
      .eq('needs_reauth', false)
      .maybeSingle();
    if (perAgent) integration = perAgent as IntegrationRow;

    if (!integration && agent?.portal_email) {
      const { data: orgAcct } = await supabase
        .from('integration_accounts')
        .select('provider, account_label, access_token, refresh_token, expires_at, status')
        .eq('portal_email', agent.portal_email as string)
        .in('provider', ['gmail', 'outlook'])
        .maybeSingle();
      if (orgAcct && (orgAcct as Record<string, unknown>).status !== 'needs_reauth') {
        const o = orgAcct as Record<string, unknown>;
        integration = {
          id:                 `org:${agent.portal_email}:${o.provider}`,
          agent_id:           item.agent_id as string,
          provider:           o.provider as 'gmail' | 'outlook',
          email:              (o.account_label as string | null) ?? '',
          access_token:       (o.access_token as string | null) ?? '',
          refresh_token:      (o.refresh_token as string | null) ?? null,
          token_expires_at:   (o.expires_at as string | null) ?? null,
          last_sync_at:       null,
          needs_reauth:       false,
          reauth_notified_at: null,
        } as unknown as IntegrationRow;
      }
    }

    // Strip markdown antes de enviar como text/plain (Sonnet a veces mete
    // **bold** o ##headings; el cliente ve asteriscos crudos).
    const draftPlain = stripMarkdown(item.ai_draft as string);

    let sentViaConnector = false;
    if (integration) {
      try {
        const conn = await getConnector(integration, supabase);
        const fromDisplay = businessName ? `${agentName} - ${businessName}` : agentName;
        await conn.email.sendReply({
          messageId: (item.raw_message_id as string | null) ?? '',
          threadId:  (item.thread_id as string | null) ?? undefined,
          to:        item.email_from as string,
          subject:   (item.email_subject as string | null) ?? '',
          body:      draftPlain,
          fromDisplay,
        });
        sentViaConnector = true;
      } catch (err) {
        console.error('[ops/approve] connector send failed, falling back to Resend:', err);
      }
    }

    if (!sentViaConnector) {
      // Fallback: envía desde notificaciones@centinelia.mx si no hay connector
      // o si el connector falló (token roto, etc). Mejor entregar que perder.
      await sendEmail({
        to:      item.email_from as string,
        subject: `Re: ${item.email_subject || ''}`.trim(),
        html:    simpleResponseHtml(businessName, agentName, draftPlain),
      });
    }
  }

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
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
  recordHumanDecision({
    supabase, gateType: 'ops_inbox', resourceId: item.id,
    decision: 'approve', channel: 'email_magic_link',
    reason: 'user_approved_via_magic_link',
    metadata: { item_type: item.item_type, sent_to: item.email_from, subject: item.email_subject },
    portalEmail: agent?.client_email ?? null,
  });

  const orgToken = agent?.portal_email ? await getOrgToken(agent.portal_email as string, supabase) : null;
  const tokenForUrl = orgToken ?? (agent?.portal_token as string | null | undefined);
  const portalUrl = tokenForUrl ? `${BASE_URL}/portal/${tokenForUrl}?tab=oficina` : BASE_URL;

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

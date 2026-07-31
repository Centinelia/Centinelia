import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

const INBOX_DOMAIN = process.env.EMAIL_INBOX_DOMAIN ?? 'inbox.centinelia.mx';

async function ensureReplyToken(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  existingToken: string | null | undefined,
): Promise<string | null> {
  if (existingToken) return existingToken;
  const token = crypto.randomBytes(8).toString('hex');
  const { error } = await supabase
    .from('human_requests')
    .update({ reply_token: token })
    .eq('id', requestId);
  if (error) {
    console.error('[notify] failed to persist reply_token:', error);
    return null;
  }
  return token;
}

function replyToFor(token: string | null): string | undefined {
  return token ? `${token}@${INBOX_DOMAIN}` : undefined;
}

interface HumanRequest {
  id:             string;
  agent_id:       string;
  request_type:   'info' | 'action' | 'approval';
  title:          string;
  description:    string;
  urgency:        'baja' | 'media' | 'alta';
  target_email:   string;
  source_context: string | null;
  channels_notified: string[];
}

interface Agent {
  agent_name:   string;
  business_name: string;
  portal_token: string;
  features?:    Record<string, unknown> | null;
}

export async function dispatchHumanRequestNotification(requestId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: request } = await supabase
    .from('human_requests')
    .select('*')
    .eq('id', requestId)
    .single();
  if (!request) { console.error('[notify] request not found', requestId); return; }
  if (request.status !== 'pending') { console.warn('[notify] non-pending, skip', requestId); return; }

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, business_name, portal_token, features')
    .eq('id', request.agent_id)
    .single();
  if (!agent) { console.error('[notify] agent not found', request.agent_id); return; }

  const channels = (agent.features as Record<string, unknown> | null)?.notification_channels as Record<string, boolean> | undefined;
  const sendViaEmail = channels?.email !== false;   // default true
  const sendViaWA    = channels?.whatsapp === true;
  const sendViaCall  = channels?.call_on_high_urgency === true && request.urgency === 'alta';

  const dispatched: string[] = [];

  const replyToken = await ensureReplyToken(
    supabase,
    requestId,
    (request as Record<string, unknown>).reply_token as string | null | undefined,
  );
  const replyTo = replyToFor(replyToken);

  if (sendViaEmail) {
    try {
      await sendEmail({
        to:      request.target_email,
        subject: `[${agent.agent_name}] Necesito tu ayuda: ${request.title}`,
        html:    buildRequestEmailHtml(request as HumanRequest, agent as Agent),
        replyTo,
      });
      dispatched.push('email');
    } catch (err) {
      console.error('[notify] email send failed:', err);
    }
  }

  if (sendViaWA) {
    // STUB: cuando WhatsApp salga de sandbox (spec §5.7)
    console.log('[notify] WA stub for request', requestId);
    dispatched.push('wa_stub');
  }

  if (sendViaCall) {
    // STUB: implementación de llamada via Vapi outbound queda para fase 2 según spec
    console.log('[notify] call stub for request', requestId);
    dispatched.push('call_stub');
  }

  await supabase
    .from('human_requests')
    .update({ channels_notified: dispatched })
    .eq('id', requestId);
}

export async function sendReminderNotification(requestId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: request } = await supabase.from('human_requests').select('*').eq('id', requestId).single();
  if (!request) return;
  const { data: agent } = await supabase.from('voice_agents').select('agent_name, portal_token').eq('id', request.agent_id).single();
  if (!agent) return;

  const replyToken = await ensureReplyToken(
    supabase,
    requestId,
    (request as Record<string, unknown>).reply_token as string | null | undefined,
  );
  const replyTo = replyToFor(replyToken);

  await sendEmail({
    to:      request.target_email,
    subject: `Recordatorio: ${agent.agent_name} sigue esperando: ${request.title}`,
    html:    buildReminderEmailHtml(request as HumanRequest, agent as Agent),
    replyTo,
  });
}

export async function sendEscalationNotification(requestId: string, escalateToEmail: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: request } = await supabase.from('human_requests').select('*').eq('id', requestId).single();
  if (!request) return;
  const { data: agent } = await supabase.from('voice_agents').select('agent_name, business_name, portal_token').eq('id', request.agent_id).single();
  if (!agent) return;

  const replyToken = await ensureReplyToken(
    supabase,
    requestId,
    (request as Record<string, unknown>).reply_token as string | null | undefined,
  );
  const replyTo = replyToFor(replyToken);

  await sendEmail({
    to:      escalateToEmail,
    subject: `[Escalado] ${agent.agent_name} no ha recibido respuesta a: ${request.title}`,
    html:    buildEscalationEmailHtml(request as HumanRequest, agent as Agent, escalateToEmail),
    replyTo,
  });
}

function requestUrl(portalToken: string, requestId: string): string {
  return `${BASE_URL}/portal/${portalToken}/requests/${requestId}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildRequestEmailHtml(req: HumanRequest, agent: Agent): string {
  const url = requestUrl(agent.portal_token, req.id);
  const typeLabel = { info: 'Necesita información', action: 'Necesita acción', approval: 'Necesita aprobación' }[req.request_type];
  const urgencyLabel = { baja: 'Baja', media: 'Media', alta: 'Alta' }[req.urgency];
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:28px">
      <p style="color:rgba(26,10,59,0.6);font-size:12px;margin:0 0 6px">${escapeHtml(agent.business_name)} · ${typeLabel} · Urgencia: ${urgencyLabel}</p>
      <h1 style="color:#1A0A3B;font-size:20px;font-weight:700;margin:0 0 16px">${escapeHtml(agent.agent_name)} necesita tu ayuda</h1>
      <div style="background:#F4F0FF;border-left:3px solid #6C3BFF;padding:16px;margin:0 0 20px">
        <p style="color:#1A0A3B;font-size:14px;font-weight:600;margin:0 0 8px">${escapeHtml(req.title)}</p>
        <p style="color:rgba(26,10,59,0.7);font-size:13px;line-height:1.6;margin:0;white-space:pre-wrap">${escapeHtml(req.description)}</p>
      </div>
      ${req.source_context ? `<details style="margin:0 0 20px"><summary style="color:rgba(26,10,59,0.5);font-size:12px;cursor:pointer">Contexto (correo original)</summary><p style="color:rgba(26,10,59,0.6);font-size:12px;line-height:1.5;margin:8px 0 0;white-space:pre-wrap">${escapeHtml(req.source_context)}</p></details>` : ''}
      <div style="text-align:center">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Responder ahora</a>
      </div>
    </div>
  </div>
</body></html>`;
}

function buildReminderEmailHtml(req: HumanRequest, agent: Agent): string {
  const url = requestUrl(agent.portal_token, req.id);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(245,158,11,0.24);border-radius:12px;padding:28px">
      <h1 style="color:#1A0A3B;font-size:18px;font-weight:700;margin:0 0 12px">Recordatorio</h1>
      <p style="color:rgba(26,10,59,0.7);font-size:14px;line-height:1.6;margin:0 0 16px">${escapeHtml(agent.agent_name)} sigue esperando tu respuesta desde hace 24 horas:</p>
      <p style="color:#1A0A3B;font-size:14px;font-weight:600;margin:0 0 16px">${escapeHtml(req.title)}</p>
      <div style="text-align:center">
        <a href="${url}" style="display:inline-block;background:#f59e0b;color:#000;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Responder ahora</a>
      </div>
    </div>
  </div>
</body></html>`;
}

function buildEscalationEmailHtml(req: HumanRequest, agent: Agent, escalatedTo: string): string {
  const url = requestUrl(agent.portal_token, req.id);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(239,68,68,0.24);border-radius:12px;padding:28px">
      <p style="color:#dc2626;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Escalado a ti</p>
      <h1 style="color:#1A0A3B;font-size:18px;font-weight:700;margin:0 0 12px">${escapeHtml(agent.agent_name)} no recibió respuesta en 48 horas</h1>
      <p style="color:rgba(26,10,59,0.7);font-size:14px;line-height:1.6;margin:0 0 8px">Solicitud original a ${escapeHtml(req.target_email)}:</p>
      <p style="color:#1A0A3B;font-size:14px;font-weight:600;margin:0 0 16px">${escapeHtml(req.title)}</p>
      <p style="color:rgba(26,10,59,0.7);font-size:13px;line-height:1.6;margin:0 0 20px;white-space:pre-wrap">${escapeHtml(req.description)}</p>
      <div style="text-align:center">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Responder ahora</a>
      </div>
    </div>
  </div>
</body></html>`;
}

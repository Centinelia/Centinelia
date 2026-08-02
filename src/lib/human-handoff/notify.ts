import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendEmail,
  agentBrandedFrom,
  shell,
  badge,
  heading,
  infoCard,
  btn,
  sectionLabel,
} from '@/lib/email/send';
import { resolveMeerkatFromAgent } from '@/lib/email/meerkat-identity';

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
  agent_name:    string | null;
  business_name: string;
  portal_token:  string;
  features:      Record<string, unknown> | null;
}

const URGENCY_COLOR: Record<HumanRequest['urgency'], string> = {
  baja:  '#8C7FB8',
  media: '#FBBF24',
  alta:  '#EF4444',
};

const URGENCY_LABEL: Record<HumanRequest['urgency'], string> = {
  baja:  'Urgencia baja',
  media: 'Urgencia media',
  alta:  'Urgencia alta',
};

const TYPE_LABEL: Record<HumanRequest['request_type'], string> = {
  info:     'Necesito información',
  action:   'Necesito una acción',
  approval: 'Necesito tu aprobación',
};

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
        from:    agentBrandedFrom(agent.agent_name as string | null),
        subject: `[${agent.agent_name}] Necesito tu ayuda: ${request.title}`,
        html:    buildRequestEmailHtml(request as HumanRequest, agent as Agent, replyTo),
        replyTo,
      });
      dispatched.push('email');
    } catch (err) {
      console.error('[notify] email send failed:', err);
    }
  }

  if (sendViaWA) {
    console.log('[notify] WA stub for request', requestId);
    dispatched.push('wa_stub');
  }

  if (sendViaCall) {
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
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, business_name, portal_token, features')
    .eq('id', request.agent_id)
    .single();
  if (!agent) return;

  const replyToken = await ensureReplyToken(
    supabase,
    requestId,
    (request as Record<string, unknown>).reply_token as string | null | undefined,
  );
  const replyTo = replyToFor(replyToken);

  await sendEmail({
    to:      request.target_email,
    from:    agentBrandedFrom(agent.agent_name as string | null),
    subject: `Recordatorio: ${agent.agent_name} sigue esperando: ${request.title}`,
    html:    buildReminderEmailHtml(request as HumanRequest, agent as Agent),
    replyTo,
  });
}

export async function sendEscalationNotification(requestId: string, escalateToEmail: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: request } = await supabase.from('human_requests').select('*').eq('id', requestId).single();
  if (!request) return;
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, business_name, portal_token, features')
    .eq('id', request.agent_id)
    .single();
  if (!agent) return;

  const replyToken = await ensureReplyToken(
    supabase,
    requestId,
    (request as Record<string, unknown>).reply_token as string | null | undefined,
  );
  const replyTo = replyToFor(replyToken);

  await sendEmail({
    to:      escalateToEmail,
    from:    agentBrandedFrom(agent.agent_name as string | null),
    subject: `[Escalado] ${agent.agent_name} no ha recibido respuesta a: ${request.title}`,
    html:    buildEscalationEmailHtml(request as HumanRequest, agent as Agent),
    replyTo,
  });
}

function requestUrl(portalToken: string, requestId: string): string {
  return `${BASE_URL}/portal/${portalToken}/requests/${requestId}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function replyHint(replyTo: string | undefined): string {
  if (!replyTo) return '';
  return `<p style="color:#8C7FB8;font-size:12px;line-height:1.6;text-align:center;margin:16px 0 0">
    Puedes responder este correo directamente y tu respuesta quedará registrada en la solicitud.
  </p>`;
}

function sourceContextBlock(source: string | null): string {
  if (!source) return '';
  return `<div style="margin:16px 0 0">
    ${sectionLabel('Correo original')}
    <p style="color:#C8BEE8;font-size:12px;line-height:1.6;margin:0;white-space:pre-wrap;padding:14px;background:#2A1B5C;border-left:3px solid #3D2E6A;border-radius:8px">${escapeHtml(source)}</p>
  </div>`;
}

function buildRequestEmailHtml(req: HumanRequest, agent: Agent, replyTo?: string): string {
  const meerkat = resolveMeerkatFromAgent(agent);
  const url = requestUrl(agent.portal_token, req.id);
  const accent = URGENCY_COLOR[req.urgency];

  return shell(
    `${badge(URGENCY_LABEL[req.urgency], accent)}
    ${heading('Necesito tu ayuda', `${agent.business_name} · ${TYPE_LABEL[req.request_type]}`)}
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:#F1EEFF;font-size:15px;font-weight:600;margin:0 0 10px;line-height:1.4">${escapeHtml(req.title)}</p>
      <p style="color:#C8BEE8;font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap">${escapeHtml(req.description)}</p>
    `, true)}
    ${sourceContextBlock(req.source_context)}
    ${btn('Responder ahora →', url, { color: meerkat.color })}
    ${replyHint(replyTo)}`,
    { meerkat, preheader: `${meerkat.name}: ${req.title}` },
  );
}

function buildReminderEmailHtml(req: HumanRequest, agent: Agent): string {
  const meerkat = resolveMeerkatFromAgent(agent);
  const url = requestUrl(agent.portal_token, req.id);
  const ambar = '#FBBF24';

  return shell(
    `${badge('Recordatorio · 24 horas', ambar)}
    ${heading('Sigo esperando tu respuesta', agent.business_name)}
    ${infoCard(`
      ${sectionLabel('Solicitud pendiente')}
      <p style="color:#F1EEFF;font-size:15px;font-weight:600;margin:0;line-height:1.4">${escapeHtml(req.title)}</p>
    `, true)}
    ${btn('Responder ahora →', url, { color: ambar })}`,
    { meerkat, preheader: `Recordatorio: ${req.title}` },
  );
}

function buildEscalationEmailHtml(req: HumanRequest, agent: Agent): string {
  const meerkat = resolveMeerkatFromAgent(agent);
  const url = requestUrl(agent.portal_token, req.id);
  const rojo = '#EF4444';

  return shell(
    `${badge('Escalado · 48h sin respuesta', rojo)}
    ${heading('Necesito respuesta', agent.business_name)}
    <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 16px">
      La solicitud original fue enviada a <strong style="color:#F1EEFF">${escapeHtml(req.target_email)}</strong> hace 48 horas sin respuesta.
    </p>
    ${infoCard(`
      ${sectionLabel('Solicitud')}
      <p style="color:#F1EEFF;font-size:15px;font-weight:600;margin:0 0 10px;line-height:1.4">${escapeHtml(req.title)}</p>
      <p style="color:#C8BEE8;font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap">${escapeHtml(req.description)}</p>
    `, true)}
    ${btn('Responder ahora →', url, { color: rojo })}`,
    { meerkat, preheader: `Escalado: ${req.title}` },
  );
}

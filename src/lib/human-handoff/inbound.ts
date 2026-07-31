// src/lib/human-handoff/inbound.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { parseReplyBody } from './parse-reply';
import { resumeAgentAfterHumanResponse } from './resume';
import { buildStaleReplyHtml, BASE_URL } from './auto-reply';
import type { HandoffRequestMatch } from '@/lib/email/inbox';

export interface HandoffAttachment {
  name: string;
  url:  string;
  type: string;
  size: number;
}

const AUTO_REPLY_PATTERNS = /^(automatic reply|auto-?reply|out of office|fuera de la oficina|autoresponder)/i;
const AUTO_REPLY_FROM = /(mailer-daemon|postmaster|no-?reply)/i;

const STATUS_ACTIVE = new Set(['pending', 'escalated']);

export async function processHandoffReply(opts: {
  request:      HandoffRequestMatch;
  from:         string;
  subject:      string;
  text:         string;
  attachments:  HandoffAttachment[];
}): Promise<void> {
  const { request, from, subject, text, attachments } = opts;

  // 1. Auto-reply detection: skip vacation responders / bounces
  if (AUTO_REPLY_FROM.test(from) || AUTO_REPLY_PATTERNS.test(subject)) {
    console.log('[handoff-inbound] auto-reply detected, skip', { requestId: request.id, from });
    return;
  }

  const supabase = createAdminClient();

  // 2. Guard de estado: si ya no está receptiva, mandar auto-reply "stale"
  if (!STATUS_ACTIVE.has(request.status)) {
    await sendStaleAutoReply(request, from);
    return;
  }

  // 3. Parsear body
  const { cleanText, hadQuotedContent } = parseReplyBody(text);
  const finalText = cleanText.trim() || text.trim();

  // 4. UPDATE human_requests
  const { error: updErr } = await supabase
    .from('human_requests')
    .update({
      status:              'responded',
      response_text:       finalText,
      response_files:      attachments,
      response_source:     'email',
      responded_at:        new Date().toISOString(),
      responded_by_email:  from,
    })
    .eq('id', request.id);

  if (updErr) {
    console.error('[handoff-inbound] update failed:', updErr);
    return;
  }

  console.log('[handoff-inbound] reply captured', {
    requestId:     request.id,
    hasAttachments: attachments.length > 0,
    hadQuotedContent,
    textLength:    finalText.length,
  });

  // 5. Trigger resume (non-blocking)
  resumeAgentAfterHumanResponse(request.id).catch(err =>
    console.error('[handoff-inbound] resume failed:', err)
  );
}

async function sendStaleAutoReply(request: HandoffRequestMatch, from: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: full } = await supabase
    .from('human_requests')
    .select('status, responded_at, cancelled_at, timeout_at, agent_id')
    .eq('id', request.id)
    .single();

  if (!full) return;

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('agent_name, portal_token')
    .eq('id', request.agent_id)
    .single();
  if (!agent) return;

  const status = full.status as 'responded' | 'cancelled' | 'timeout';
  const respondedAt = new Date(
    (full.responded_at ?? full.cancelled_at ?? full.timeout_at ?? new Date().toISOString()) as string
  );
  const portalUrl = `${BASE_URL}/portal/${agent.portal_token as string}/requests/${request.id}`;

  const html = buildStaleReplyHtml({
    agentName:    agent.agent_name as string,
    requestTitle: request.title,
    status,
    respondedAt,
    portalUrl,
  });

  // Extract bare email address for the "to" field
  const toMatch = from.match(/<([^>]+)>/);
  const toAddr = toMatch ? toMatch[1] : from.trim();

  await sendEmail({
    to:      toAddr,
    subject: `Solicitud ya procesada: ${request.title}`,
    html,
    // NOTA: sendEmail() no soporta headers custom todavía. Los headers
    // RFC 3834 (Auto-Submitted, X-Auto-Response-Suppress) idealmente irían
    // aquí para prevenir loops con vacation responders. Riesgo bajo porque
    // AUTO_REPLY_PATTERNS/AUTO_REPLY_FROM ya filtra la mayoría del ruido.
    // Si aparece loop en prod, extender sendEmail para aceptar `headers?`.
  });
}

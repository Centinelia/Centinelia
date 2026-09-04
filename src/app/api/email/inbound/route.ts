// Receives inbound email via webhook from SendGrid Inbound Parse (or compatible service).
// Configure your provider to POST to:
//   https://www.centinelia.mx/api/email/inbound?secret=EMAIL_INBOUND_SECRET
// SendGrid: set MX record for EMAIL_INBOX_DOMAIN → mx.sendgrid.net
export const dynamic     = 'force-dynamic';
// processInboxEmail dispara LLM Haiku con loop de tools + posible download
// de attachments generados + envío Resend con adjuntos. Puede tomar 30-90s
// para statements grandes. Default Vercel Hobby 10s / Pro 60s mataría el
// fire-and-forget silenciosamente (nada se persistiría en ops_inbox).
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveInboxToken, parseSenderName, parseToToken, resolveAgentFromToken, resolveHumanRequestFromToken, resolveIncidentFromToken } from '@/lib/email/inbox';
import { processHandoffReply, type HandoffAttachment } from '@/lib/human-handoff/inbound';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import { applyCommsRouting } from '@/lib/comms/routing';
import { findNoxAgent, processEmailWithNox } from '@/lib/ops/nox-coordinator';
import { sendEmail, agentBrandedFrom } from '@/lib/email/send';
import { resolveAutoMode } from '@/lib/email/email-sync';
import type { ReplyAttachment } from '@/lib/connectors';

interface StoredAttachment {
  name: string;
  url:  string;
  type: string;
  size: number;
}

export async function POST(req: NextRequest) {
  // Auth: rechazar 503 si env vacío (antes: accept-all → prompt injection en Nash).
  // Ver Scope C3 CRIT-4.
  const configuredSecret = process.env.EMAIL_INBOUND_SECRET;
  if (!configuredSecret) {
    console.error('[email/inbound] EMAIL_INBOUND_SECRET not set — rejecting');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';

  let to = '', from = '', subject = '', text = '', headers = '';
  const rawAttachments: { name: string; buf: Buffer; type: string }[] = [];

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    to      = (form.get('to')      as string) ?? '';
    from    = (form.get('from')    as string) ?? '';
    subject = (form.get('subject') as string) ?? '';
    text    = (form.get('text')    as string) ?? '';
    headers = (form.get('headers') as string) ?? '';

    const count = parseInt((form.get('attachments') as string) ?? '0', 10);
    for (let i = 1; i <= Math.min(count, 5); i++) {
      const file = form.get(`attachment${i}`) as File | null;
      if (!file || file.size > 10 * 1024 * 1024) continue; // skip files >10MB
      rawAttachments.push({
        name: file.name,
        buf:  Buffer.from(await file.arrayBuffer()),
        type: file.type || 'application/octet-stream',
      });
    }
  } else if (contentType.includes('application/json')) {
    const body = await req.json() as Record<string, string>;
    to      = body.to      ?? '';
    from    = body.from    ?? '';
    subject = body.subject ?? '';
    text    = body.text    ?? '';
    headers = body.headers ?? '';
  }

  const token = parseToToken(to);
  console.log('[email-inbound] entry', { to, from, subject, tokenLen: token.length, tokenHash: token.slice(0,4) + '***' + token.slice(-2), hasAttachments: rawAttachments.length });
  if (!token) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();

  // Dedupe por Message-ID (SendGrid Parse lo pasa en `headers`). Sin este
  // gate, retry SendGrid = Nash procesa el mismo correo N veces + gasto LLM
  // N× + posible respuesta duplicada al cliente. Ver Scope C3 CRIT-4.
  const messageIdMatch = headers.match(/^Message-I[dD]:\s*<?([^>\s]+)>?/m);
  const messageId = messageIdMatch?.[1] ?? null;
  if (messageId) {
    const { data: inserted } = await supabase
      .from('webhook_events')
      .insert({ source: 'email_inbound', event_id: messageId, metadata: { from, to, subject } })
      .select('event_id')
      .maybeSingle();
    if (!inserted) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  // Helper: upload attachments to human-request-files bucket (handoff path only)
  async function uploadHandoffAttachments(requestId: string, agentId: string): Promise<HandoffAttachment[]> {
    const stored: HandoffAttachment[] = [];
    for (const att of rawAttachments) {
      const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${agentId}/${requestId}/${Date.now()}-${safeName}`;
      const { data: uploaded } = await supabase.storage
        .from('human-request-files')
        .upload(path, att.buf, { contentType: att.type, upsert: false });
      if (uploaded?.path) {
        const { data: signed } = await supabase.storage
          .from('human-request-files')
          .createSignedUrl(uploaded.path, 60 * 60 * 24 * 30); // 30d — match respond/route.ts pattern
        if (signed?.signedUrl) {
          stored.push({ name: att.name, url: signed.signedUrl, type: att.type, size: att.buf.length });
        }
      }
    }
    return stored;
  }

  // 0. Try incident reply first (32 hex chars = UUID sin guiones — Nash usa
  //    esto en el Reply-To de sus emails al cliente). El cliente responde,
  //    reabrimos el incidente y creamos un nuevo bug_report que Nash procesa
  //    en su siguiente ciclo. Discriminador de longitud vs handoff (16) y
  //    agent/inbox (12).
  const incidentMatch = await resolveIncidentFromToken(token);
  if (incidentMatch) {
    // Reabrir el incidente: si estaba resolved/closed, vuelve a open. Si
    // estaba awaiting_verification/sent_to_claude_code, marca open explícito
    // para que Nash lo re-trabaje. Preserva meta existente (claude_code_comments,
    // etc.) — antes se pisaba y se perdía el historial de comments de Nash.
    // También limpia resolution para no dejar el mensaje contradictorio
    // "auto-verificado" cuando el incidente vuelve a estar abierto.
    const { data: prevIncident } = await supabase
      .from('platform_incidents')
      .select('meta, resolution')
      .eq('id', incidentMatch.incidentId)
      .maybeSingle();
    const prevMeta = ((prevIncident as any)?.meta as Record<string, unknown> | null) ?? {};
    const prevResolution = (prevIncident as any)?.resolution as string | null;
    await supabase
      .from('platform_incidents')
      .update({
        status:     'open',
        resolution: null,
        meta: {
          ...prevMeta,
          reopened_at:     new Date().toISOString(),
          reopened_reason: 'client_email_reply',
          reopened_by:     from,
          ...(prevResolution ? { previous_resolution: prevResolution } : {}),
        },
      })
      .eq('id', incidentMatch.incidentId);

    // Crear un nuevo tool_call_log tipo 'reportar_falla' con el contenido del
    // reply. Nash lo verá como una señal fresca en su próxima corrida y
    // volverá a crear/actualizar el incidente + posiblemente notificar de
    // nuevo o escalar si es la 2da+ ocurrencia.
    if (incidentMatch.affectedAgentId) {
      await supabase.from('tool_call_log').insert({
        agent_id:     incidentMatch.affectedAgentId,
        portal_email: incidentMatch.affectedPortalEmail,
        channel:      'portal',
        tool_name:    'reportar_falla',
        input_json:   {
          tipo:        'reopen',
          descripcion: `[REABRIÓ CASO] ${incidentMatch.title}\n\nCliente respondió: ${text.trim().slice(0, 2000)}\n\nReferencia incidente: ${incidentMatch.incidentId}`,
          source:      'incident_reply',
          from,
          subject:     subject || null,
        },
        ok:           true,
        latency_ms:   0,
        attempt:      1,
      });
    }

    // Trigger Nash inmediato para que procese la reapertura sin esperar al cron.
    const { triggerNashMonitor } = await import('@/lib/ops/nash-trigger');
    triggerNashMonitor(`incident reply ${incidentMatch.incidentId.slice(0, 8)} from ${from}`);

    return NextResponse.json({ ok: true, incident_reopened: incidentMatch.incidentId });
  }

  // 1. Try handoff reply first (16 hex chars, unique length discriminator)
  const handoffMatch = await resolveHumanRequestFromToken(token);
  if (handoffMatch) {
    const attachments = await uploadHandoffAttachments(handoffMatch.id, handoffMatch.agent_id);
    // Process non-blocking so the webhook returns 200 fast. Si falla, persiste
    // en handoff_failed_responses para que el cron retry-failed-handoffs lo
    // recupere (audit sesión 53, ver migrations/20260731_handoff_retry_queue.sql).
    processHandoffReply({
      request:     handoffMatch,
      from,
      subject,
      text,
      attachments,
    }).catch(async err => {
      console.error('[handoff-inbound] processHandoffReply failed:', err);
      try {
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase.from('handoff_failed_responses').insert({
          human_request_id: handoffMatch.id,
          from_email:       from,
          subject:          subject || null,
          text_body:        text || null,
          attachments,
          last_error:       errMsg.slice(0, 2000),
          retry_count:      0,
          next_retry_at:    new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        });
      } catch (persistErr) {
        console.error('[handoff-inbound] failed to persist failure to retry queue:', persistErr);
      }
    });
    return NextResponse.json({ ok: true });
  }

  // 2. Direct email a un agente específico (agent-token 12 chars).
  //
  // Este path atiende DOS casos:
  //   a) cliente responde a un correo previo del agente (thread continuation)
  //   b) cliente/humano manda correo nuevo dirigido al agente para pedirle algo
  //
  // Pre-2026-09-03 solo cubría (a): creaba agent_messages + agent_tasks y
  // retornaba sin invocar el LLM. Bug: correos nuevos al agent-token quedaban
  // sin procesamiento — Nova/Nala/etc nunca contestaban. Ahora además de
  // registrar el task de tracking, invocamos processInboxEmail con el agente
  // como opsAgent + sendReplyFn dirigido, replicando el pattern del webhook
  // portal-shared path (línea ~360 abajo).
  const agentMatch = await resolveAgentFromToken(token);
  console.log('[email-inbound] agentMatch result', { tokenLen: token.length, matched: !!agentMatch, agentId: agentMatch?.agentId, portalEmail: agentMatch?.portalEmail });

  if (agentMatch) {
    const { data: targetAgent, error: targetAgentErr } = await supabase
      .from('voice_agents')
      .select('id, portal_email, agent_name, role, role_knowledge_base, business_name, client_email, portal_token, email_from, email_domain_verified, trust_stage, features, approval_email, auto_mode')
      .eq('id', agentMatch.agentId)
      .single();
    console.log('[email-inbound] targetAgent fetch', { agentId: agentMatch.agentId, found: !!targetAgent, err: targetAgentErr?.message });

    if (targetAgent) {
      const senderName = parseSenderName(from);
      const preview    = text.trim().slice(0, 220);
      const content    = [
        subject ? `"${subject}"` : null,
        preview ? (preview.length < text.trim().length ? preview + '…' : preview) : null,
      ].filter(Boolean).join(' — ') || 'Correo sin cuerpo.';

      const { error: msgInsErr } = await supabase.from('agent_messages').insert({
        portal_email:  agentMatch.portalEmail,
        from_agent_id: null,
        to_agent_id:   targetAgent.id,
        vapi_call_id:  null,
        type:          'email',
        content:       content.slice(0, 400),
        metadata:      { from, from_name: senderName, subject: subject || null },
      });
      console.log('[email-inbound] agent_messages insert', { ok: !msgInsErr, err: msgInsErr?.message });

      const { error: taskInsErr } = await supabase.from('agent_tasks').insert({
        portal_email:   agentMatch.portalEmail,
        created_by:     null,
        assigned_to:    targetAgent.id,
        title:          `Correo${senderName ? ` de ${senderName}` : ''}: ${subject || '(sin asunto)'}`.slice(0, 200),
        description:    `${senderName || from} escribió al inbox del empleado.`,
        status:         'pending',
        trigger_type:   'email',
        source_context: `De: ${from}\nAsunto: ${subject}\n\n${text.trim().slice(0, 500)}`,
      });
      console.log('[email-inbound] agent_tasks insert', { ok: !taskInsErr, err: taskInsErr?.message });

      // Attachments: reutilizar el mismo pipeline de storage que el
      // portal-shared path para que create_file/pdf de Neus/Nova/Nala puedan
      // adjuntarse al reply.
      const agentStoredAttachments: StoredAttachment[] = [];
      const monthAgt = new Date().toISOString().slice(0, 7);
      for (const att of rawAttachments) {
        const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path     = `${agentMatch.portalEmail}/${monthAgt}/${Date.now()}-${safeName}`;
        const { data: stored } = await supabase.storage
          .from('email-attachments')
          .upload(path, att.buf, { contentType: att.type, upsert: false });
        if (stored?.path) {
          const { data: { publicUrl } } = supabase.storage
            .from('email-attachments')
            .getPublicUrl(stored.path);
          agentStoredAttachments.push({
            name: att.name, url: publicUrl, type: att.type, size: att.buf.length,
          });
        } else {
          console.error('[email-inbound agent-token] attachment_upload_failed', {
            path, filename: att.name, mime: att.type, size: att.buf.length,
          });
        }
      }

      const ownerEmail = (targetAgent as Record<string, unknown>).client_email as string | null;
      console.log('[email-inbound] pre-processInboxEmail', { ownerEmail, attachmentsCount: agentStoredAttachments.length, agentId: targetAgent.id });
      if (ownerEmail) {
        // Traer org-level para KB + kill switch auto-mode
        const { data: orgDataAgt } = await supabase
          .from('organizations')
          .select('knowledge_base, auto_mode_disabled_at')
          .eq('portal_email', agentMatch.portalEmail)
          .maybeSingle();

        const brandedFromAgt = agentBrandedFrom({
          agent_name:            targetAgent.agent_name as string | null,
          business_name:         targetAgent.business_name as string | null,
          email_from:            (targetAgent as Record<string, unknown>).email_from as string | null,
          email_domain_verified: (targetAgent as Record<string, unknown>).email_domain_verified as boolean | null,
        });
        const replySubjectAgt = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
        const escapeHtmlAgt = (s: string) => s
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const sendReplyFnAgt = async (body: string, attachments?: ReplyAttachment[]) => {
          const bodyHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap;color:#1a1a1a;line-height:1.5;font-size:14px">${escapeHtmlAgt(body)}</div>`;
          const ok = await sendEmail({
            to:      from,
            subject: replySubjectAgt,
            html:    bodyHtml,
            from:    brandedFromAgt,
            attachments: attachments?.map(a => ({
              filename: a.filename,
              content:  a.content.toString('base64'),
            })),
          });
          if (!ok) throw new Error('sendEmail returned false — RESEND_API_KEY missing or Resend rejected');
        };

        const orgDisabledAgt = !!(orgDataAgt as Record<string, unknown> | null)?.auto_mode_disabled_at;
        const autoModeAgt = resolveAutoMode({
          trust_stage: (targetAgent as Record<string, unknown>).trust_stage as number | null,
          orgDisabled: orgDisabledAgt,
        });

        processInboxEmail({
          agentId:       targetAgent.id,
          source:        'sendgrid',
          emailFrom:     from,
          emailSubject:  subject,
          emailBody:     text,
          attachments:   agentStoredAttachments,
          agentName:     (targetAgent.agent_name as string | null) ?? 'Centinelia',
          businessName:  targetAgent.business_name as string,
          knowledgeBase: (orgDataAgt?.knowledge_base as string | null) ?? null,
          roleKB:        targetAgent.role_knowledge_base as string | null,
          agentRole:     targetAgent.role as string | null,
          ownerEmail,
          portalToken:   targetAgent.portal_token as string,
          portalEmail:   agentMatch.portalEmail,
          autoMode:      autoModeAgt,
          approvalEmail: (targetAgent as Record<string, unknown>).approval_email as string | null | undefined,
          sendReplyFn:   sendReplyFnAgt,
        }).catch(err => console.error('[ops agent-token] inbox-processor error:', err));
      }
    }

    return NextResponse.json({ ok: true });
  }

  const portalEmail = await resolveInboxToken(token);
  if (!portalEmail) return NextResponse.json({ ok: true }); // unknown inbox, ignore

  // Find the ops agent (with role) or fall back to first agent.
  // Columnas extras (email_from, email_domain_verified, trust_stage, features,
  // approval_email, auto_mode) las necesita el webhook sendReplyFn +
  // autoMode resolver — sin ellas Nova nunca enviaría reply automático.
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, role, role_knowledge_base, business_name, client_email, portal_token, agent_name, email_from, email_domain_verified, trust_stage, features, approval_email, auto_mode')
    .eq('portal_email', portalEmail)
    .order('created_at', { ascending: true });

  if (!agents?.length) return NextResponse.json({ ok: true });

  const opsAgent = agents.find(a => a.role) ?? agents[0];
  const agent    = { id: opsAgent.id };

  if (!agent) return NextResponse.json({ ok: true });

  // Traer org-level para KB + kill switch auto-mode. Match con resume.ts pattern.
  const { data: orgData } = await supabase
    .from('organizations')
    .select('knowledge_base, auto_mode_disabled_at')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  // Store attachments in Supabase Storage
  const storedAttachments: StoredAttachment[] = [];
  const month = new Date().toISOString().slice(0, 7);
  for (const att of rawAttachments) {
    const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path     = `${portalEmail}/${month}/${Date.now()}-${safeName}`;
    const { data: stored } = await supabase.storage
      .from('email-attachments')
      .upload(path, att.buf, { contentType: att.type, upsert: false });

    if (stored?.path) {
      const { data: { publicUrl } } = supabase.storage
        .from('email-attachments')
        .getPublicUrl(stored.path);
      storedAttachments.push({
        name: att.name,
        url:  publicUrl,
        type: att.type,
        size: att.buf.length,
      });
    } else {
      // Silent drop era invisible: el correo se guardaba con 0 attachments y el
      // usuario nunca sabía. Loguear con contexto para poder rehacer manualmente.
      console.error('[email-inbound] attachment_upload_failed', {
        path, filename: att.name, mime: att.type, size: att.buf.length,
      });
    }
  }

  const senderName = parseSenderName(from);
  const preview    = text.trim().slice(0, 220);
  const content    = [
    subject ? `"${subject}"` : null,
    preview ? (preview.length < text.trim().length ? preview + '…' : preview) : null,
  ].filter(Boolean).join(' — ') || 'Correo sin cuerpo.';

  await supabase.from('agent_messages').insert({
    portal_email:  portalEmail,
    from_agent_id: null,
    to_agent_id:   agent.id,
    vapi_call_id:  null,
    type:          'email',
    content:       content.slice(0, 400),
    metadata: {
      from,
      from_name:        senderName,
      subject:          subject || null,
      attachment_count: storedAttachments.length,
      attachments:      storedAttachments,
    },
  });

  // Comms routing (non-blocking)
  applyCommsRouting({
    agentId:    opsAgent.id,
    supabase,
    fromEmail:  from,
    subject,
    body:       text,
    senderName: senderName || '',
  }).catch(err => console.error('[comms-routing] error:', err));

  // Nox coordinator email routing (non-blocking).
  // El catch antes era vacío `.catch(() => {})` y silenciosamente perdía
  // emails de escalación destinados a Nox. Audit sesión 53 lo cerró.
  findNoxAgent(portalEmail).then(nox => {
    if (!nox || nox.id === opsAgent.id) return;
    const sibs = (agents ?? []).filter(a => a.id !== nox.id);
    processEmailWithNox({
      portalEmail,
      noxAgent:     nox,
      siblings:     sibs.map(s => ({ id: s.id, agent_name: s.agent_name as string | null, role: s.role as string | null })),
      emailFrom:    from,
      emailSubject: subject,
      emailBody:    text,
    }).catch(err => console.error('[nox] email routing error:', err));
  }).catch(err => {
    console.error('[nox] findNoxAgent failed — email may lose Nox routing', {
      portalEmail, subject, error: String(err),
    });
  });

  // Ops AI processing (non-blocking — returns 200 immediately)
  const ownerEmail = opsAgent.client_email;
  if (ownerEmail) {
    // Webhook sendReplyFn: cuando el correo llega vía inbound webhook (no
    // Gmail/Outlook OAuth integration), enviamos la respuesta con `sendEmail`
    // de Resend. Soporta attachments generados por create_file/create_document,
    // usa branded from del agente y setea reply-to al inbox address del
    // agente para que futuras respuestas del cliente vuelvan a caer aquí.
    // Sin este fn, Nova y compañía nunca contestaban vía webhook path — se
    // quedaban en pending (bug arquitectural pre-2026-09-03).
    const brandedFrom = agentBrandedFrom({
      agent_name:            opsAgent.agent_name as string | null,
      business_name:         opsAgent.business_name as string | null,
      email_from:            (opsAgent as Record<string, unknown>).email_from as string | null,
      email_domain_verified: (opsAgent as Record<string, unknown>).email_domain_verified as boolean | null,
    });
    const replySubjectBase = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const escapeHtml = (s: string) => s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const sendReplyFn = async (body: string, attachments?: ReplyAttachment[]) => {
      const bodyHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap;color:#1a1a1a;line-height:1.5;font-size:14px">${escapeHtml(body)}</div>`;
      const ok = await sendEmail({
        to:      from,
        subject: replySubjectBase,
        html:    bodyHtml,
        from:    brandedFrom,
        attachments: attachments?.map(a => ({
          filename: a.filename,
          content:  a.content.toString('base64'),
        })),
      });
      if (!ok) throw new Error('sendEmail returned false — RESEND_API_KEY missing or Resend rejected');
    };

    const orgDisabled = !!(orgData as Record<string, unknown> | null)?.auto_mode_disabled_at;
    const autoMode = resolveAutoMode({
      trust_stage: (opsAgent as Record<string, unknown>).trust_stage as number | null,
      orgDisabled,
    });

    processInboxEmail({
      agentId:       opsAgent.id,
      source:        'sendgrid',
      emailFrom:     from,
      emailSubject:  subject,
      emailBody:     text,
      attachments:   storedAttachments,
      agentName:     (opsAgent.agent_name as string | null) ?? 'Centinelia',
      businessName:  opsAgent.business_name as string,
      knowledgeBase: (orgData?.knowledge_base as string | null) ?? null,
      roleKB:        opsAgent.role_knowledge_base as string | null,
      agentRole:     opsAgent.role as string | null,
      ownerEmail,
      portalToken:   opsAgent.portal_token as string,
      portalEmail,
      autoMode,
      approvalEmail: (opsAgent as Record<string, unknown>).approval_email as string | null | undefined,
      sendReplyFn,
    }).catch(err => console.error('[ops] inbox-processor error:', err));
  }

  return NextResponse.json({ ok: true });
}

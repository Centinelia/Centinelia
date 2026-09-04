/**
 * GET /api/cron/agent-mailboxes
 *
 * Polea el buzón IMAP de cada empleado con `features.smtp_config.imap_host`
 * configurado, y rutea los correos entrantes al pipeline según el `role`
 * del agente.
 *
 * Routing:
 *  - role='facturacion' → insert en billing_incoming_emails + enqueue
 *    billing_jobs (compatible con /api/billing/inbox y Nala del piloto).
 *  - otros roles: skip por ahora (extensible cuando aparezcan casos).
 *
 * Cadence: cada 10 min (igual que nala-mailbox de Titan). Configurar en
 * vercel.json:
 *   { "path": "/api/cron/agent-mailboxes", "schedule": "*\/10 * * * *" }
 *
 * Feature flag: `AGENT_MAILBOXES_ENABLED=true`. Sin él, no-op.
 *
 * Idempotencia: markSeen sólo se hace tras encolar exitosamente el job.
 * Si el proceso crashea a mitad, el correo queda unread y se re-procesa
 * en el próximo tick (billing_jobs tiene su propio dedup por message_id).
 *
 * Auth: Bearer CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { decrypt } from '@/lib/crypto';
import { fetchUnreadFromImap, markSeenInImap, createImapSmtpConnector, type SmtpConfig, type FetchedEmail } from '@/lib/connectors/imap-smtp';
import { enqueueBillingEmail } from '@/lib/billing/employee/queue';
import { acquireAgentMailboxLock, releaseAgentMailboxLock } from '@/lib/agent-mailboxes/lock';
import { processInboxEmail } from '@/lib/ops/inbox-processor';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

interface AgentRow {
  id:           string;
  agent_name:   string;
  role:         string | null;
  portal_email: string | null;
  features:     Record<string, unknown> | null;
}

interface SmtpFeatures {
  host?:         string;
  port?:         number;
  secure?:       boolean;
  username?:     string;
  password_enc?: string;
  tls_insecure?: boolean;
  imap_host?:    string;
  imap_port?:    number;
}

interface AgentResult {
  agent_id:    string;
  agent_name:  string;
  role:        string | null;
  fetched:     number;
  enqueued:    number;
  skipped:     number;
  markedSeen:  number;
  lockedByOther?: boolean;
  error?:      string;
}

function buildCfg(smtp: SmtpFeatures): SmtpConfig | null {
  if (!smtp.host || !smtp.username || !smtp.password_enc) return null;
  if (!smtp.imap_host) return null;
  return {
    host:         smtp.host,
    port:         smtp.port ?? 465,
    secure:       smtp.secure !== false,
    username:     smtp.username,
    password:     decrypt(smtp.password_enc),
    tlsInsecure:  smtp.tls_insecure === true,
    imapHost:     smtp.imap_host,
    imapPort:     smtp.imap_port ?? 993,
  };
}

async function routeGenericAgent(
  supabase: ReturnType<typeof createAdminClient>,
  agent: AgentRow,
  email: FetchedEmail,
  cfg: SmtpConfig,
): Promise<{ ok: boolean; error?: string }> {
  // Campos adicionales para el runner genérico
  const { data: agentFull, error: agentErr } = await supabase
    .from('voice_agents')
    .select('business_name, client_email, portal_token, role_knowledge_base, approval_email, auto_reply, trust_stage')
    .eq('id', agent.id)
    .maybeSingle<{
      business_name:        string | null;
      client_email:         string | null;
      portal_token:         string | null;
      role_knowledge_base:  string | null;
      approval_email:       string | null;
      auto_reply:           boolean | null;
      trust_stage:          string | null;
    }>();
  if (agentErr || !agentFull) return { ok: false, error: `agent extra: ${agentErr?.message ?? 'not found'}` };
  if (!agentFull.client_email || !agentFull.portal_token || !agentFull.business_name) {
    return { ok: false, error: 'agent sin client_email/portal_token/business_name' };
  }

  // KB de la org (opcional)
  let knowledgeBase: string | null = null;
  if (agent.portal_email) {
    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base')
      .eq('portal_email', agent.portal_email)
      .maybeSingle<{ knowledge_base: string | null }>();
    knowledgeBase = org?.knowledge_base ?? null;
  }

  // Separar imágenes para vision multimodal (cap 4 por Claude) de otros
  // attachments. Los no-imagen quedan como metas — el runner podrá listarlos
  // pero descarga por URL no está implementada para IMAP (aceptable para
  // atencion_cliente que raramente necesita leer PDFs entrantes).
  const isVisionMime = (ct: string): ct is 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' =>
    /^image\/(jpeg|png|gif|webp)$/i.test(ct);
  const attachmentImages = email.attachments
    .filter(a => isVisionMime(a.contentType))
    .slice(0, 4)
    .map(a => ({
      name:     a.filename,
      base64:   a.content.toString('base64'),
      mimeType: a.contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
    }));
  const attachmentMetas = email.attachments.map(a => ({
    name: a.filename,
    url:  `imap:${email.uid}/${a.filename}`,
    type: a.contentType,
    size: a.size,
  }));

  const connector = createImapSmtpConnector(cfg);

  try {
    await processInboxEmail({
      agentId:           agent.id,
      source:            'imap-smtp',
      rawMessageId:      String(email.uid),
      threadId:          email.messageId ?? undefined,
      emailFrom:         email.from,
      emailSubject:      email.subject,
      emailBody:         email.bodyText,
      attachments:       attachmentMetas,
      attachmentImages:  attachmentImages.length > 0 ? attachmentImages : undefined,
      agentName:         agent.agent_name,
      businessName:      agentFull.business_name,
      knowledgeBase,
      roleKB:            agentFull.role_knowledge_base,
      agentRole:         agent.role,
      ownerEmail:        agentFull.client_email,
      portalToken:       agentFull.portal_token,
      portalEmail:       agent.portal_email ?? undefined,
      autoMode:          agentFull.auto_reply ? 'auto' : 'off',
      approvalEmail:     agentFull.approval_email,
      sendReplyFn: (body, attachments) => connector.email.sendReply({
        messageId: String(email.uid),
        threadId:  email.messageId ?? undefined,
        to:        email.from,
        subject:   email.subject,
        body,
        attachments,
      }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `processInboxEmail: ${(e as Error).message}` };
  }
}

async function routeFacturacion(
  supabase: ReturnType<typeof createAdminClient>,
  agent: AgentRow,
  email: FetchedEmail,
): Promise<{ ok: boolean; error?: string }> {
  if (!agent.portal_email) return { ok: false, error: 'agent sin portal_email' };

  // Resolver integration_id via organization_integrations type='contpaqi'
  const { data: integ, error: integErr } = await supabase
    .from('organization_integrations')
    .select('id')
    .eq('portal_email', agent.portal_email)
    .eq('type', 'contpaqi')
    .maybeSingle<{ id: string }>();
  if (integErr) return { ok: false, error: `integration lookup: ${integErr.message}` };
  if (!integ) return { ok: false, error: 'no contpaqi integration' };

  const attachmentsMeta = email.attachments.map(a => ({
    filename:    a.filename,
    contentType: a.contentType,
    size:        a.size,
  }));

  // Upsert por (portal_email, message_id) — el índice único parcial
  // dedup-ea si ya se insertó en un tick anterior (markSeen falló, tick
  // solapado, etc). Sin message_id (raro pero legal), cae a insert normal.
  const inputRow = {
    portal_email:     agent.portal_email,
    integration_id:   integ.id,
    from_address:     email.from,
    to_address:       email.to.join(', '),
    subject:          email.subject || null,
    body_text:        email.bodyText || null,
    attachment_count: email.attachments.length,
    attachments_meta: attachmentsMeta.length > 0 ? attachmentsMeta : null,
    raw_payload:      { source: 'agent-mailboxes-cron', uid: email.uid },
    message_id:       email.messageId,
  };

  const { data: row, error: insertErr } = email.messageId
    ? await supabase
        .from('billing_incoming_emails')
        .upsert(inputRow, { onConflict: 'portal_email,message_id', ignoreDuplicates: false })
        .select('id')
        .single()
    : await supabase
        .from('billing_incoming_emails')
        .insert(inputRow)
        .select('id')
        .single();

  if (insertErr || !row) return { ok: false, error: `insert: ${insertErr?.message}` };

  const kind = email.attachments.length > 0 ? 'process_notes' : 'reply_missing_attachments';
  try {
    await enqueueBillingEmail({
      emailId:       row.id as string,
      kind,
      portalEmail:   agent.portal_email,
      integrationId: integ.id,
    });
  } catch (e) {
    return { ok: false, error: `enqueue: ${(e as Error).message}` };
  }
  return { ok: true };
}

async function processAgent(
  supabase: ReturnType<typeof createAdminClient>,
  agent: AgentRow,
): Promise<AgentResult> {
  const result: AgentResult = {
    agent_id:   agent.id,
    agent_name: agent.agent_name,
    role:       agent.role,
    fetched:    0,
    enqueued:   0,
    skipped:    0,
    markedSeen: 0,
  };

  const smtp = (agent.features ?? {})['smtp_config'] as SmtpFeatures | undefined;
  if (!smtp) return { ...result, error: 'sin smtp_config' };
  const cfg = buildCfg(smtp);
  if (!cfg) return { ...result, error: 'smtp_config sin imap_host' };

  // Lock por agent_id para prevenir ticks solapados (Vercel no garantiza
  // single-execution). Sin lock, dos runs paralelos duplican fetch IMAP
  // (aunque el índice único de billing_incoming_emails ya dedupe inserts).
  const lock = await acquireAgentMailboxLock(supabase, agent.id);
  if (!lock) {
    return { ...result, lockedByOther: true };
  }

  try {
    let emails: FetchedEmail[];
    try {
      emails = await fetchUnreadFromImap(cfg, { limit: 20 });
    } catch (e) {
      return { ...result, error: `fetch: ${(e as Error).message}` };
    }
    result.fetched = emails.length;
    if (emails.length === 0) return result;

    const seenUids: number[] = [];

    const roleLower = (agent.role ?? '').toLowerCase();

    for (const email of emails) {
      // Routing: facturacion tiene pipeline especializado (billing_jobs +
      // writer .NET). Cualquier otro role va al runner genérico
      // processInboxEmail que carga prompt/tools per-agent y responde
      // desde su propio buzón SMTP.
      const routed = roleLower === 'facturacion'
        ? await routeFacturacion(supabase, agent, email)
        : await routeGenericAgent(supabase, agent, email, cfg);

      if (routed.ok) {
        result.enqueued++;
        seenUids.push(email.uid);
      } else {
        result.skipped++;
        console.warn(`[agent-mailboxes] ${agent.agent_name} (${agent.role ?? 'sin-role'}) skip uid=${email.uid}: ${routed.error}`);
      }
    }

    if (seenUids.length > 0) {
      try {
        await markSeenInImap(cfg, seenUids);
        result.markedSeen = seenUids.length;
      } catch (e) {
        result.error = `markSeen: ${(e as Error).message}`;
      }
    }

    return result;
  } finally {
    await releaseAgentMailboxLock(supabase, lock).catch(() => { /* best-effort */ });
  }
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (process.env.AGENT_MAILBOXES_ENABLED !== 'true') {
    return NextResponse.json({ skipped: 'disabled', reason: 'AGENT_MAILBOXES_ENABLED != true' });
  }

  const supabase = createAdminClient();

  // Cargar agentes con smtp_config populated. Filtrar en app-code por
  // imap_host presence (querying nested JSONB con filter multi-key es
  // frágil vs schema drift).
  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, portal_email, features')
    .eq('active', true)
    .not('features->smtp_config', 'is', null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: AgentResult[] = [];
  for (const agent of (agents ?? []) as AgentRow[]) {
    results.push(await processAgent(supabase, agent));
  }

  const summary = results.reduce(
    (acc, r) => ({
      agents_processed:  acc.agents_processed  + 1,
      total_fetched:     acc.total_fetched     + r.fetched,
      total_enqueued:    acc.total_enqueued    + r.enqueued,
      total_skipped:     acc.total_skipped     + r.skipped,
      agents_locked:     acc.agents_locked     + (r.lockedByOther ? 1 : 0),
      agents_with_error: acc.agents_with_error + (r.error ? 1 : 0),
    }),
    { agents_processed: 0, total_fetched: 0, total_enqueued: 0, total_skipped: 0, agents_locked: 0, agents_with_error: 0 },
  );

  return NextResponse.json({ ok: true, summary, results });
}

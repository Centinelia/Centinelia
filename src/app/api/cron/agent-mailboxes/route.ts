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
import { fetchUnreadFromImap, markSeenInImap, type SmtpConfig, type FetchedEmail } from '@/lib/connectors/imap-smtp';
import { enqueueBillingEmail } from '@/lib/billing/employee/queue';

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

  const { data: row, error: insertErr } = await supabase
    .from('billing_incoming_emails')
    .insert({
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
    })
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

  let emails: FetchedEmail[];
  try {
    emails = await fetchUnreadFromImap(cfg, { limit: 20 });
  } catch (e) {
    return { ...result, error: `fetch: ${(e as Error).message}` };
  }
  result.fetched = emails.length;
  if (emails.length === 0) return result;

  const seenUids: number[] = [];

  for (const email of emails) {
    if (agent.role !== 'facturacion') {
      // Otros roles no tienen pipeline aún — skip sin markSeen para no
      // perder correos que después podamos rutear.
      result.skipped++;
      continue;
    }
    const routed = await routeFacturacion(supabase, agent, email);
    if (routed.ok) {
      result.enqueued++;
      seenUids.push(email.uid);
    } else {
      result.skipped++;
      // No agregar error a `result.error` — un correo malo no debe marcar
      // fallo global del agente. El detalle queda en el log de Vercel.
      console.warn(`[agent-mailboxes] ${agent.agent_name} skip uid=${email.uid}: ${routed.error}`);
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
      agents_processed: acc.agents_processed + 1,
      total_fetched:    acc.total_fetched    + r.fetched,
      total_enqueued:   acc.total_enqueued   + r.enqueued,
      total_skipped:    acc.total_skipped    + r.skipped,
      agents_with_error: acc.agents_with_error + (r.error ? 1 : 0),
    }),
    { agents_processed: 0, total_fetched: 0, total_enqueued: 0, total_skipped: 0, agents_with_error: 0 },
  );

  return NextResponse.json({ ok: true, summary, results });
}

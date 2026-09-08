/**
 * queue.ts — async job queue for the billing employee inbox processor.
 *
 * Uses billing_jobs table with a Postgres RPC (claim_billing_job) that executes
 * SELECT FOR UPDATE SKIP LOCKED to prevent double-processing under concurrent
 * cron runs.
 *
 * Enqueue: enqueueBillingEmail({ emailId, kind, portalEmail, integrationId })
 * Dequeue: dequeueAndRun() — claims one pending job and executes its handler.
 *
 * Handlers for each kind are stubs until Tasks 8+ implement them.
 * Max 3 attempts per job before it is permanently marked 'failed'.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { retryWithBackoff } from '@/lib/billing/util/retry';
import type { OrganizationIntegrationConfig } from '@/lib/billing/adapters';

export type BillingJobKind = 'process_notes' | 'reply_missing_attachments';

export interface EnqueueParams {
  emailId:       string;
  kind:          BillingJobKind;
  portalEmail:   string;
  integrationId: string;
}

export interface EnqueueResult {
  jobId: string;
}

export interface DequeueResult {
  processed: number;
}

const MAX_ATTEMPTS = 3;

/**
 * Insert one pending billing job into the queue.
 */
export async function enqueueBillingEmail(params: EnqueueParams): Promise<EnqueueResult> {
  const { emailId, kind, portalEmail, integrationId } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('billing_jobs')
    .insert({
      portal_email:   portalEmail,
      integration_id: integrationId,
      kind,
      payload:        { email_id: emailId },
      status:         'pending',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`[billing/queue] enqueue failed: ${error.message}`);
  }

  return { jobId: data.id as string };
}

/**
 * Claim one pending billing job atomically via the claim_billing_job RPC
 * (SELECT FOR UPDATE SKIP LOCKED) and execute its handler.
 *
 * Returns { processed: 1 } if a job was found and handled, { processed: 0 } otherwise.
 */
export async function dequeueAndRun(): Promise<DequeueResult> {
  const supabase = createAdminClient();

  // Atomic claim — returns the row already updated to status='running' with attempts++.
  const { data: rows, error: claimError } = await supabase.rpc('claim_billing_job');

  if (claimError) {
    throw new Error(`[billing/queue] claim_billing_job RPC failed: ${claimError.message}`);
  }

  const jobs = rows as BillingJobRow[] | null;
  if (!jobs || jobs.length === 0) {
    return { processed: 0 };
  }

  const job = jobs[0];

  try {
    await runHandler(job);
    await markDone(supabase, job.id);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await markFailed(supabase, job.id, job.attempts, errorMsg);
  }

  return { processed: 1 };
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface BillingJobRow {
  id:             string;
  portal_email:   string;
  integration_id: string;
  kind:           string;
  payload:        Record<string, unknown>;
  status:         string;
  attempts:       number;
  last_error:     string | null;
  created_at:     string;
  started_at:     string | null;
  finished_at:    string | null;
}

// ---------------------------------------------------------------------------
// Handler dispatch
// ---------------------------------------------------------------------------

async function runHandler(job: BillingJobRow): Promise<void> {
  switch (job.kind as BillingJobKind) {
    case 'process_notes':
      await handleProcessNotes(job);
      break;
    case 'reply_missing_attachments':
      await handleReplyMissingAttachments(job);
      break;
    default:
      throw new Error(`[billing/queue] unknown job kind: ${job.kind}`);
  }
}

/**
 * Handle a process_notes job: runs the full BillingEmployee reasoning loop.
 *
 * Reads `config` from organization_integrations by integration_id, then calls
 * buildAdapter(config) to get the correct BillingAdapter instance.
 * Throws if no matching integration row is found.
 */
async function handleProcessNotes(job: BillingJobRow): Promise<void> {
  const emailId = job.payload['email_id'] as string | undefined;
  if (!emailId) {
    throw new Error('[billing/queue] process_notes: missing email_id in payload');
  }

  // Lazy imports to keep the module lightweight at load time.
  const { BillingEmployee } = await import('@/lib/billing/employee/loop');
  const { buildAdapter } = await import('@/lib/billing/adapters');

  // Load integration config from organization_integrations.
  // Wrapped in retryWithBackoff to tolerate transient Supabase network errors.
  const supabase = createAdminClient();
  const { data: integration, error: intError } = await retryWithBackoff<{
    data: { config: OrganizationIntegrationConfig } | null;
    error: { message: string } | null;
  }>(
    () =>
      supabase
        .from('organization_integrations')
        .select('config')
        .eq('id', job.integration_id)
        .single() as unknown as Promise<{
          data: { config: OrganizationIntegrationConfig } | null;
          error: { message: string } | null;
        }>,
    {
      maxAttempts:   3,
      initialDelayMs: 100,
      maxDelayMs:    2000,
      isRetryable: (error: unknown) => {
        const err = error as Record<string, unknown>;
        const code = (err?.['code'] ?? err?.['status'] ?? 0) as string | number;
        // PostgREST error codes (e.g. PGRST116 = row not found) — permanent, no retry.
        if (typeof code === 'string' && code.startsWith('PGRST')) return false;
        // 4xx HTTP errors (except 429 Too Many Requests) — permanent, no retry.
        if (typeof code === 'number' && code >= 400 && code < 500 && code !== 429) return false;
        return true;
      },
    },
  );

  if (intError || !integration) {
    throw new Error(
      `[billing/queue] process_notes: integration not found for id=${job.integration_id}`,
    );
  }

  const adapter = buildAdapter(integration.config);

  // Resolver el voice_agent de Nala para cobrar el loop LLM al pool. Si no
  // encontramos Nala activa para esta org, degradamos silencioso — el loop
  // corre pero no cobra. Auditoría 2026-09-04.
  // Resolver Nala robusto: preferir role='facturacion' (canónico), fallback a
  // ilike '%nala%' para orgs que no migraron aún. Auditoría 2026-09-04 ronda 2.
  // Prefer role_id='nala' (canónico) sobre role='facturacion' (display string).
  // Traemos también features para sacar smtp_config del agente, necesario para
  // outbound sin depender de Resend (dry run FASE 4).
  const { data: nalaByRoleId } = await supabase
    .from('voice_agents')
    .select('id, features, client_email')
    .eq('portal_email', job.portal_email)
    .eq('features->>meerkat_role_id', 'nala')
    .eq('active', true)
    .maybeSingle();
  const { data: nalaAgent } = nalaByRoleId
    ? { data: nalaByRoleId as { id: string; features: Record<string, unknown> | null; client_email: string | null } }
    : await supabase
        .from('voice_agents')
        .select('id, features, client_email')
        .eq('portal_email', job.portal_email)
        .ilike('agent_name', '%nala%')
        .eq('active', true)
        .limit(1)
        .maybeSingle() as unknown as { data: { id: string; features: Record<string, unknown> | null; client_email: string | null } | null };
  const nalaAgentId = (nalaAgent?.id as string | null) ?? undefined;

  // Extraer SMTP config del agente y desencriptar el password para pasarlo
  // como AgentSmtpOverride al empleado.
  let smtpOverride: import('../mail/send').AgentSmtpOverride | undefined;
  const smtpRaw = (nalaAgent?.features as Record<string, unknown> | null | undefined)?.['smtp_config'] as
    | { host?: string; port?: number; secure?: boolean; username?: string; password_enc?: string; from_display?: string | null; tls_insecure?: boolean }
    | undefined;
  if (smtpRaw?.host && smtpRaw.username && smtpRaw.password_enc) {
    try {
      const { decrypt } = await import('@/lib/crypto');
      smtpOverride = {
        host:        String(smtpRaw.host),
        port:        Number(smtpRaw.port ?? 465),
        secure:      Boolean(smtpRaw.secure ?? true),
        username:    String(smtpRaw.username),
        password:    decrypt(smtpRaw.password_enc),
        ...(smtpRaw.from_display ? { fromDisplay: smtpRaw.from_display } : {}),
        ...(smtpRaw.tls_insecure ? { tlsInsecure: true } : {}),
      };
    } catch (e) {
      console.warn(`[billing/queue] no se pudo desencriptar smtp password: ${(e as Error).message}. Fallback a Resend.`);
    }
  }

  const employee = new BillingEmployee(adapter, {
    portalEmail: job.portal_email,
    integrationId: job.integration_id,
    dropboxToken: process.env.BILLING_DROPBOX_TOKEN ?? '',
    dropboxBasePath: process.env.BILLING_DROPBOX_BASE_PATH ?? '/Facturacion',
    // Prioridad: env BILLING_ESCALATION_EMAIL → voice_agent.client_email (correo
    // real del dueño, ej Beatriz) → portal_email como último fallback. Antes
    // caía directo a portal_email que suele ser correo interno Centinelia
    // (ej piloto-estrella@centinelia.mx), inservible para el humano dueño.
    // Dry run FASE 4 (2026-09-07).
    escalationEmail:
      process.env.BILLING_ESCALATION_EMAIL ??
      (nalaAgent?.client_email ?? job.portal_email),
    orgName: job.portal_email,
    ...(nalaAgentId ? { agentId: nalaAgentId } : {}),
    ...(smtpOverride ? { smtp: smtpOverride } : {}),
  });

  const result = await employee.runOnEmail(emailId);

  if (result.errors.length > 0) {
    // Surface errors to the queue so markFailed is triggered if needed.
    throw new Error(
      `[billing/queue] process_notes completed with errors: ${result.errors.join('; ')}`,
    );
  }

  console.log('[billing/queue] process_notes completed', {
    jobId: job.id,
    emailId,
    processed: result.processed,
    escalated: result.escalated,
    consulted: result.consulted,
  });
}

/**
 * Handle a reply_missing_attachments job: replies to the inbound email
 * asking the sender to provide photos of the billing notes.
 */
async function handleReplyMissingAttachments(job: BillingJobRow): Promise<void> {
  const emailId = job.payload['email_id'] as string | undefined;
  if (!emailId) {
    throw new Error('[billing/queue] reply_missing_attachments: missing email_id in payload');
  }

  const { replyToInboundEmail } = await import('../mail/send');

  const body = [
    '<p>Hola,</p>',
    '<p>Recibimos tu correo, pero no detectamos imagenes de notitas de venta adjuntas.</p>',
    '<p>Por favor reenviale con las fotos de las notitas para que podamos procesarlas.</p>',
    '<p>Gracias.</p>',
  ].join('\n');

  await replyToInboundEmail(emailId, body);

  console.log('[billing/queue] reply_missing_attachments sent', { jobId: job.id, emailId });
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

async function markDone(supabase: ReturnType<typeof createAdminClient>, id: string): Promise<void> {
  const { error } = await supabase
    .from('billing_jobs')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[billing/queue] markDone error:', error.message);
  }
}

async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  id:       string,
  attempts: number,
  msg:      string,
): Promise<void> {
  // If this was the last allowed attempt, permanently fail.
  // Otherwise revert to pending so the next cron run retries.
  const nextStatus = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

  const { error } = await supabase
    .from('billing_jobs')
    .update({
      status:      nextStatus,
      last_error:  msg,
      finished_at: nextStatus === 'failed' ? new Date().toISOString() : null,
      // Reset started_at so the retry window is clean.
      started_at:  null,
    })
    .eq('id', id);

  if (error) {
    console.error('[billing/queue] markFailed error:', error.message);
  }
}

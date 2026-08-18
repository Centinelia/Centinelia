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

/** Stub — Task 8 will implement the real handler. */
async function handleProcessNotes(job: BillingJobRow): Promise<void> {
  console.log('[billing/queue] process_notes stub', { jobId: job.id, payload: job.payload });
}

/** Stub — Task 8 will implement the real handler. */
async function handleReplyMissingAttachments(job: BillingJobRow): Promise<void> {
  console.log('[billing/queue] reply_missing_attachments stub', { jobId: job.id, payload: job.payload });
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

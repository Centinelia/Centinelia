import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export const dynamic = 'force-dynamic';

interface EmailJob {
  id:              string;
  agent_id:        string;
  portal_email:    string;
  to_addr:         string;
  subject:         string;
  html:            string;
  reply_to:        string | null;
  from_addr:       string | null;
  attachment_url:  string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  source:          string;
  reference_id:    string | null;
  charge_source:   string | null;
  charge_label:    string | null;
  source_table:    string | null;
  source_row_id:   string | null;
  attempts:        number;
  max_attempts:    number;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createAdminClient();
  const batchSize = 20;

  const { data: pending } = await supabase
    .from('email_send_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(batchSize);

  const jobs = (pending ?? []) as EmailJob[];
  const results = { picked: jobs.length, done: 0, retried: 0, failed: 0 };

  for (const job of jobs) {
    const { data: locked } = await supabase
      .from('email_send_jobs')
      .update({
        status:        'processing',
        processing_at: new Date().toISOString(),
        attempts:      job.attempts + 1,
      })
      .eq('id', job.id)
      .eq('status', 'pending')
      .select()
      .single();
    if (!locked) continue;

    try {
      const { data: agent } = await supabase
        .from('voice_agents')
        .select('agent_name, business_name, email_from, email_domain_verified')
        .eq('id', job.agent_id)
        .single();

      const attachment = job.attachment_url
        ? { url: job.attachment_url, name: job.attachment_name ?? 'file', mime: job.attachment_mime ?? 'application/octet-stream' }
        : undefined;

      const sendRes = await sendMeerkatHtmlEmail({
        agentId: job.agent_id,
        to:      job.to_addr,
        subject: job.subject,
        html:    job.html,
        replyTo: job.reply_to ?? undefined,
        from:    job.from_addr ?? undefined,
        attachment: attachment as never,
        agent:   agent as never,
      }, supabase);

      if (!sendRes.ok) throw new Error(`send failed: ${sendRes.error ?? 'unknown'}`);

      await supabase
        .from('email_send_jobs')
        .update({
          status:        'done',
          delivered_at:  new Date().toISOString(),
          provider:      sendRes.provider,
          provider_meta: sendRes.meta ?? null,
        })
        .eq('id', job.id)
        .select()
        .single();

      if (job.charge_source) {
        try {
          await consumeAiOp(job.agent_id, 1, {
            source:       job.charge_source,
            label:        job.charge_label ?? job.charge_source,
            reference_id: job.reference_id ?? undefined,
          });
        } catch (err) {
          console.error('[email-jobs] charge failed (deferred audit gap):', err);
        }
      }

      if (job.source_table && job.source_row_id) {
        await supabase
          .from(job.source_table)
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', job.source_row_id);
      }

      results.done++;
    } catch (err) {
      const attemptsSoFar = (locked as EmailJob).attempts;
      const isFinal = attemptsSoFar >= job.max_attempts;
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Backoff exponencial: 30s × 2^attempts (attempts=1→60s, 2→2m, 3→4m, 4→8m, 5→final)
      const delayMs = 30_000 * Math.pow(2, attemptsSoFar);
      const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

      await supabase
        .from('email_send_jobs')
        .update({
          status:          isFinal ? 'failed' : 'pending',
          next_attempt_at: nextAttemptAt,
          last_error:      errorMsg,
          failed_at:       isFinal ? new Date().toISOString() : null,
        })
        .eq('id', job.id)
        .select()
        .single();

      if (isFinal) {
        results.failed++;
        console.error('[email-jobs] job max_attempts reached:', { job_id: job.id, error: errorMsg });
      } else {
        results.retried++;
        console.warn('[email-jobs] job retry:', { job_id: job.id, attempt: attemptsSoFar, next_attempt_at: nextAttemptAt, error: errorMsg });
      }
    }
  }

  return NextResponse.json({ ok: true, ...results, latency_ms: Date.now() - started });
}

import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface EnqueueEmailArgs {
  agentId:       string;
  portalEmail:   string;
  to:            string;
  subject:       string;
  html:          string;
  from?:         string;
  replyTo?:      string;
  attachment?:   { url: string; name: string; mime: string };
  source:        string;
  referenceId?:  string;
  chargeSource?: string;
  chargeLabel?:  string;
  sourceTable?:  string;
  sourceRowId?:  string;
}

export type EnqueueEmailResult =
  | { ok: true;  job_id: string }
  | { ok: false; error: string };

export async function enqueueEmailJob(
  args:     EnqueueEmailArgs,
  supabase: SupabaseClient,
): Promise<EnqueueEmailResult> {
  const row = {
    agent_id:        args.agentId,
    portal_email:    args.portalEmail,
    to_addr:         args.to,
    subject:         args.subject,
    html:            args.html,
    reply_to:        args.replyTo ?? null,
    from_addr:       args.from ?? null,
    attachment_url:  args.attachment?.url ?? null,
    attachment_name: args.attachment?.name ?? null,
    attachment_mime: args.attachment?.mime ?? null,
    source:          args.source,
    reference_id:    args.referenceId ?? null,
    charge_source:   args.chargeSource ?? null,
    charge_label:    args.chargeLabel ?? null,
    source_table:    args.sourceTable ?? null,
    source_row_id:   args.sourceRowId ?? null,
    status:          'pending',
  };

  const { data, error } = await supabase
    .from('email_send_jobs')
    .insert(row)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, job_id: (data as { id: string }).id };
}

export async function enqueueEmailJobBatch(
  common:     Omit<EnqueueEmailArgs, 'to'>,
  recipients: Array<{ to: string }>,
  supabase:   SupabaseClient,
): Promise<EnqueueEmailResult[]> {
  if (recipients.length === 0) return [];

  const rows = recipients.map(r => ({
    agent_id:        common.agentId,
    portal_email:    common.portalEmail,
    to_addr:         r.to,
    subject:         common.subject,
    html:            common.html,
    reply_to:        common.replyTo ?? null,
    from_addr:       common.from ?? null,
    attachment_url:  common.attachment?.url ?? null,
    attachment_name: common.attachment?.name ?? null,
    attachment_mime: common.attachment?.mime ?? null,
    source:          common.source,
    reference_id:    common.referenceId ?? null,
    charge_source:   common.chargeSource ?? null,
    charge_label:    common.chargeLabel ?? null,
    source_table:    common.sourceTable ?? null,
    source_row_id:   common.sourceRowId ?? null,
    status:          'pending',
  }));

  const { data, error } = await supabase
    .from('email_send_jobs')
    .insert(rows)
    .select('id');

  if (error) {
    return recipients.map(() => ({ ok: false as const, error: error.message }));
  }
  const inserted = (data ?? []) as Array<{ id: string }>;
  return inserted.map(r => ({ ok: true as const, job_id: r.id }));
}

const FLAG_TTL_MS = 30_000;

interface FlagCacheEntry {
  value:      boolean;
  fetchedAt:  number;
}
const flagCache = new Map<string, FlagCacheEntry>();

export function __clearEmailJobsFlagCache(): void {
  flagCache.clear();
}

export async function isEmailJobsEnabled(
  portalEmail: string,
  supabase:    SupabaseClient,
): Promise<boolean> {
  const cached = flagCache.get(portalEmail);
  const now = Date.now();
  if (cached && (now - cached.fetchedAt) < FLAG_TTL_MS) {
    return cached.value;
  }

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('email_jobs_enabled')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    if (error) throw error;
    const value = !!(data as { email_jobs_enabled?: boolean } | null)?.email_jobs_enabled;
    flagCache.set(portalEmail, { value, fetchedAt: now });
    return value;
  } catch (err) {
    console.error('[email-jobs] isEmailJobsEnabled fail-safe:', err);
    return false;
  }
}

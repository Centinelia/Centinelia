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

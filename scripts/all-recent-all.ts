import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data } = await sb.from('ops_inbox')
    .select('created_at, email_from, email_subject, status, category, attachments')
    .eq('agent_id', '3245bc1f-89e1-4949-bbed-71a18b05e344')
    .order('created_at', { ascending: false }).limit(10);
  for (const r of (data ?? []) as any[]) {
    const atts = (r.attachments ?? []).map((a: any) => a.name).join(', ');
    console.log(`[${r.created_at}] [${r.status}/${r.category}] "${r.email_subject}" from ${r.email_from}${atts ? ' atts:' + atts.slice(0, 80) : ''}`);
  }
}
main().catch(e => console.error(e));

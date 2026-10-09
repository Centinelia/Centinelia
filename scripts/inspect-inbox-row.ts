import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const id = process.argv[2];
  if (!id) throw new Error('usage: tsx inspect-inbox-row.ts <ops_inbox_id>');
  const { data } = await sb.from('ops_inbox').select('*').eq('id', id).single();
  const r = data as any;
  console.log('id:', r.id);
  console.log('subject:', r.email_subject);
  console.log('from:', r.email_from);
  console.log('to:', r.email_to);
  console.log('created_at:', r.created_at);
  console.log('status:', r.status, 'category:', r.category);
  console.log('attachments:', JSON.stringify(r.attachments));
  console.log('reply_at:', r.reply_at);
  console.log('reply_subject:', r.reply_subject);
  console.log('\n--- EMAIL BODY (primeros 3000 chars) ---');
  console.log((r.email_body ?? '').slice(0, 3000));
  console.log('\n--- REPLY BODY (primeros 3000 chars) ---');
  console.log((r.reply_body ?? '').slice(0, 3000));
  console.log('\n--- INFO REQUESTED REASON ---');
  console.log(r.info_requested_reason ?? '(none)');
}
main().catch(e => { console.error(e); process.exit(1); });

import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami').single();
  const { data: inbox } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, email_from, status, auto_mode_decision, auto_mode_reason, sent_at, ai_draft, attachments')
    .eq('agent_id', (agent as any).id)
    .ilike('email_subject', '%backlog%')
    .order('created_at', { ascending: false })
    .limit(3);
  for (const r of (inbox ?? []) as any[]) {
    const atts = (r.attachments ?? []).map((a: any) => `${a.name}${a.download_url ? ' [URL]' : ''}`).join(', ');
    console.log(`\n[${r.created_at}] ${r.email_subject}`);
    console.log(`  from: ${r.email_from}`);
    console.log(`  status: ${r.status}  decision: ${r.auto_mode_decision ?? '-'}  reason: ${String(r.auto_mode_reason ?? '-').slice(0, 100)}`);
    console.log(`  sent_at: ${r.sent_at ?? 'NO'}`);
    console.log(`  attachments: ${atts}`);
    console.log(`  draft: ${r.ai_draft ? String(r.ai_draft).slice(0, 300) : '(vacío)'}`);
  }
  // Mutations
  const { data: muts } = await sb.from('inventory_mutations_log')
    .select('created_at, success, error_code, after_state')
    .eq('tool_name', 'inv_importar_backlog')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n=== mutations inv_importar_backlog ===');
  for (const m of (muts ?? []) as any[]) {
    console.log(`[${m.created_at}] ok=${m.success} err=${m.error_code} after=${JSON.stringify(m.after_state).slice(0, 200)}`);
  }
}
main().catch(e => console.error(e));

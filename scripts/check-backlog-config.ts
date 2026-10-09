import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();
  const { data: org } = await sb.from('organizations').select('id, inventory_excel_config').ilike('name', '%AC Proyectos%').single();
  console.log('org:', (org as any)?.id);
  const cfg = (org as any)?.inventory_excel_config ?? {};
  console.log('backlog_trane:', JSON.stringify(cfg.backlog_trane ?? '(no configurado)', null, 2));
  console.log('sheets.backlog:', JSON.stringify(cfg.sheets?.backlog ?? '(no configurado)', null, 2));

  // Y último correo backlog
  const { data: agentFull } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami').single();
  const { data: inbox } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, email_from, status, category, auto_mode_reason, ai_draft, sent_at, attachments')
    .eq('agent_id', (agentFull as any).id)
    .ilike('email_subject', '%backlog%')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('\n=== BACKLOG inbox rows ===');
  for (const r of (inbox ?? []) as any[]) {
    const atts = (r.attachments ?? []).map((a: any) => a.name).join(', ');
    console.log(`\n[${r.created_at}] ${r.email_subject}`);
    console.log(`  from: ${r.email_from}`);
    console.log(`  status: ${r.status}  reason: ${r.auto_mode_reason ?? '-'}  sent: ${r.sent_at ?? 'NO'}`);
    console.log(`  attachments: ${atts || '(none)'}`);
    console.log(`  draft: ${r.ai_draft ? String(r.ai_draft).slice(0, 200) : '(vacío)'}`);
  }
}
main().catch(e => console.error(e));

import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const sb = createAdminClient();

  const { data: agents } = await sb.from('voice_agents')
    .select('id, agent_name, auto_reply, trust_stage, approval_email, features, portal_email')
    .eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agent = (agents?.[0] as any);
  console.log('=== NAMI CONFIG ===');
  console.log(`trust_stage:    ${agent.trust_stage}  (1=observador 2=supervisado 3=auto)`);
  console.log(`auto_reply:     ${agent.auto_reply}`);
  console.log(`approval_email: ${agent.approval_email}`);

  const { data: org } = await sb.from('organizations')
    .select('auto_mode_disabled_at').eq('id', agent.organization_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle();
  console.log(`org auto_mode_disabled_at: ${(org as any)?.auto_mode_disabled_at ?? '(not disabled)'}`);

  console.log(`\nUsing agent.id: ${agent.id}`);
  console.log('\n=== ÚLTIMOS 10 CORREOS (TODOS) ===');
  const { data: inbox, error } = await sb.from('ops_inbox')
    .select('id, created_at, email_subject, email_from, status, category, sent_at, ai_draft, auto_mode_decision, auto_mode_reason')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) { console.error('ERROR:', error); return; }
  console.log(`count: ${inbox?.length ?? 0}`);
  for (const r of (inbox ?? []) as any[]) {
    console.log(`\n[${r.created_at}] ${r.email_subject}`);
    console.log(`  from:       ${r.email_from}`);
    console.log(`  status:     ${r.status}  category: ${r.category}`);
    console.log(`  auto_mode:  decision=${r.auto_mode_decision ?? '-'}  reason="${r.auto_mode_reason ?? '-'}"`);
    console.log(`  sent_at:    ${r.sent_at ?? '(SIN SEND)'}`);
    if (r.ai_draft) {
      console.log(`  ai_draft:   ${String(r.ai_draft).slice(0, 200)}...`);
    } else {
      console.log(`  ai_draft:   (vacío)`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });

import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { processInboxEmail } = await import('../src/lib/ops/inbox-processor');
  const sb = createAdminClient();
  // Mini test: solo processInboxEmail con rawMessageId único — verá los logs nuevos
  const TEST_ID = `verify-deploy-${Date.now()}`;
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const a = agent as any;
  await processInboxEmail({
    agentId: a.id, source: 'outlook', rawMessageId: TEST_ID, threadId: TEST_ID,
    emailFrom: 'test@test.com', emailSubject: 'REGISTRAR OC 9999',
    emailBody: 'test', attachments: [],
    agentName: 'Nami', businessName: 'AC Proyectos',
    knowledgeBase: null, roleKB: null, agentRole: a.role ?? null,
    ownerEmail: a.client_email ?? '', portalToken: a.portal_token ?? '',
    portalEmail: a.portal_email ?? undefined, autoMode: 'off', approvalEmail: null,
  });
  // Esperar
  await new Promise(r => setTimeout(r, 3000));
  const { data } = await sb.from('llm_call_log').select('source').eq('agent_id', a.id).gte('created_at', new Date(Date.now() - 15000).toISOString()).order('created_at');
  console.log('local sources:', (data ?? []).map((l: any) => l.source).join(', '));
}
main().catch(e => console.error(e));

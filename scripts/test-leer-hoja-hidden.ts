import './_bootstrap';
async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { executeAgentTool } = await import('../src/lib/tools/executor');
  const sb = createAdminClient();
  const { data: agent } = await sb.from('voice_agents').select('*').eq('id', '3245bc1f-89e1-4949-bbed-71a18b05e344').single();
  const execCtx = {
    agentId: '3245bc1f-89e1-4949-bbed-71a18b05e344', portalEmail: 'camila@acproyectos.com',
    agentName: 'Nami', businessName: 'AC Proyectos',
    portalToken: (agent as any).portal_token ?? '', agent: agent as any,
    supabase: sb as any, channel: 'chat' as const, userContext: 'test',
  };
  const r1 = await executeAgentTool('inv_leer_hoja', { sheet_name: 'ORDEN VARIAS' }, execCtx);
  console.log('--- ORDEN VARIAS (hidden) ---');
  console.log(JSON.stringify(r1, null, 2).slice(0, 400));
  const r2 = await executeAgentTool('inv_leer_hoja', { sheet_name: 'XXX_NO_EXISTE' }, execCtx);
  console.log('\n--- Lista con no_existe (ver available_sheets) ---');
  console.log(JSON.stringify(r2, null, 2).slice(0, 400));
}
main().catch(e => { console.error(e); process.exit(1); });
